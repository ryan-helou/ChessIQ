// Web Worker wrapper for Stockfish WASM
// Loads the single-threaded Stockfish and forwards UCI commands

let stockfish = null;

self.importScripts("/stockfish.js");

// The stockfish.js script exposes a global constructor
// Try to initialize the engine
if (typeof Stockfish === "function") {
  Stockfish().then((sf) => {
    stockfish = sf;
    stockfish.addMessageListener((msg) => {
      self.postMessage(msg);
    });
    self.postMessage("__WORKER_READY__");
  });
} else if (typeof Module !== "undefined") {
  // Alternative: some builds use Module pattern
  stockfish = Module;
  if (stockfish.addMessageListener) {
    stockfish.addMessageListener((msg) => {
      self.postMessage(msg);
    });
  }
  self.postMessage("__WORKER_READY__");
}

self.onmessage = (e) => {
  if (stockfish) {
    if (stockfish.postMessage) {
      stockfish.postMessage(e.data);
    } else if (stockfish.ccall) {
      stockfish.ccall("uci_command", "void", ["string"], [e.data]);
    }
  }
};
