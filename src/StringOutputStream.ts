/**
 * Utility class. "stream" out string data, and compile into a single string.
 */
export default class StringOutputStream {
  private _data: string[] = [];
  public write(data: string) { this._data.push(data); }
  public flush(): string {
    var rv = this._data.join("");
    this._data = [];
    return rv;
  }

}
