export interface IShowMessageBoxParams {
  text: string,
  buttons: string[],
  icon?: "none" | "info" | "error" | "question" | "warning"
}

export interface IMessageBoxService {
  show(params: IShowMessageBoxParams): Promise<number | null>;
}
