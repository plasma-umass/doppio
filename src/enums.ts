"use strict";

// A class can be in one of these states at any given point in time.
export enum ClassState {
  // The class's definition has been downloaded and parsed.
  LOADED,
  // This class and its super class' definitions have been downloaded and
  // parsed.
  RESOLVED,
  // This class, its super class', and its interfaces have been downloaded,
  // parsed, and statically initialized.
  INITIALIZED
}
