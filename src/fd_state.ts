/**
 * Stores the file position of every open file descriptor in the JVM.
 * Shared globally amongst JVM instances since this state is global.
 * We need to track this data since Node.js does not expose this OS state.
 */
export default class FDState {
  private static _positions: {[fd: number]: number} = {};

  public static open(fd: number, initialPosition: number) {
    this._positions[fd] = initialPosition;
  }

  public static getPos(fd: number): number {
    return this._positions[fd];
  }

  public static incrementPos(fd: number, incr: number): void {
    this._positions[fd] += incr;
  }

  public static setPos(fd: number, newPos: number): void {
    this._positions[fd] = newPos;
  }

  public static close(fd: number) {
    delete this._positions[fd];
  }
}

