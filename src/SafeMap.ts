/**
 * A safe to use key value map.
 * 
 * JavaScript objects cannot be used as general-purpose key value maps, as they
 * contain a number of default fields. This class avoids those issues.
 */
class SafeMap<T> {
  private cache: { [key: string]: T };

  constructor() {
    this.cache = Object.create(null);  // has no defined properties aside from __proto__
  }

  /**
   * Mutates the key so that it cannot possibly conflict with existing object
   * properties.
   */
  private fixKey(key: string): string {
    return ';' + key;
  }

  public get(key: string): T {
    key = this.fixKey(key);
    if (this.cache[key] !== undefined) {
      return this.cache[key];
    }
    return undefined;
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public set(key: string, value: T): void {
    this.cache[this.fixKey(key)] = value;
  }
}

export = SafeMap;
