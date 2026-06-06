interface Window {
  $loading: any
  $message: any
  $dialog: any
  // ngôn ngữ
  $t: any
  $vue: any
  // ghi nhật ký bàn phím
  $KeyboardActive?: { [T: string]: boolean }
  onKeySpacePressHold?: Function

  // biên tập JSON đối tượng lưu trữ
  opener: any

  /** Set on authenticated embed iframe routes */
  __TINIX_EMBED_TOKEN__?: string
}

declare type Recordable<T = any> = Record<string, T>
