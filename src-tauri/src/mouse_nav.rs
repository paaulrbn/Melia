//! Back / forward from the mouse (macOS).
//!
//! WKWebView hands neither of these to the page:
//! - the side buttons arrive as "other" buttons that WebKit reports as the middle one;
//! - many mice (and their utilities) send a swipe gesture instead (NSEventTypeSwipe),
//!   as do three-finger swipes on a trackpad and the Magic Mouse.
//!
//! A local AppKit monitor reads both and tells the webview with the `mouse-nav` event
//! ("back" or "forward"). The two-finger trackpad swipe is plain scrolling and stays on
//! the page side (useBackForward).

use std::ptr::NonNull;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use block2::RcBlock;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventType};
use tauri::{AppHandle, Emitter};

/// Button numbers of AppKit: 0 left, 1 right, 2 middle, 3 back, 4 forward.
const BUTTON_BACK: isize = 3;
const BUTTON_FORWARD: isize = 4;

/// One click of some mice sends the swipe twice: one navigation per press.
const REPEAT_GUARD: Duration = Duration::from_millis(350);

pub const EVENT_NAME: &str = "mouse-nav";

/// Direction of a swipe event, as in Safari and Chrome: positive deltaX goes back.
fn swipe_direction(delta_x: f64) -> Option<&'static str> {
    if delta_x > 0.5 {
        Some("back")
    } else if delta_x < -0.5 {
        Some("forward")
    } else {
        None
    }
}

fn button_direction(button: isize) -> Option<&'static str> {
    match button {
        BUTTON_BACK => Some("back"),
        BUTTON_FORWARD => Some("forward"),
        _ => None,
    }
}

pub fn install(app: &AppHandle) {
    let app = app.clone();
    let last_sent: Mutex<Option<Instant>> = Mutex::new(None);

    let handler = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        // SAFETY: AppKit hands a valid event for the duration of the call
        let ns_event = unsafe { event.as_ref() };
        let kind = ns_event.r#type();

        let direction = if kind == NSEventType::Swipe {
            swipe_direction(ns_event.deltaX())
        } else if kind == NSEventType::OtherMouseUp {
            button_direction(ns_event.buttonNumber())
        } else {
            None
        };

        if let Some(direction) = direction {
            let now = Instant::now();
            let mut last = last_sent.lock().unwrap_or_else(|e| e.into_inner());
            let is_repeat = last.is_some_and(|at| now.duration_since(at) < REPEAT_GUARD);
            if !is_repeat {
                *last = Some(now);
                let _ = app.emit(EVENT_NAME, direction);
            }
        }
        // The event goes on its way unchanged
        event.as_ptr()
    });

    let mask = NSEventMask::OtherMouseUp | NSEventMask::Swipe;
    // SAFETY: called on the main thread from the setup hook; the handler returns the event
    let monitor = unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &handler) };
    // The monitor lives as long as the app: never removed
    std::mem::forget(monitor);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn swipe_goes_back_on_positive_delta() {
        assert_eq!(swipe_direction(1.0), Some("back"));
        assert_eq!(swipe_direction(-1.0), Some("forward"));
        assert_eq!(swipe_direction(0.0), None);
    }

    #[test]
    fn side_buttons() {
        assert_eq!(button_direction(3), Some("back"));
        assert_eq!(button_direction(4), Some("forward"));
        assert_eq!(button_direction(2), None);
    }
}
