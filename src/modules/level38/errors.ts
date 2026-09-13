export class Level38Error extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
