export interface Config {
  [key: string]: string;
}

export interface ConfigField {
  key: string;
  label: string;
  placeholder: string;
  type?: 'text' | 'password';
}
