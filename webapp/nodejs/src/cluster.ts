import cluster from "node:cluster";

// ISUCON_NODE_WORKERS 個のワーカーで main.js を動かす (全状態はDBにあるため複数プロセスでよい)
const workers = Number(process.env.ISUCON_NODE_WORKERS || "1");

if (cluster.isPrimary && workers > 1) {
  for (let i = 0; i < workers; i++) {
    cluster.fork();
  }
  cluster.on("exit", (worker, code) => {
    console.error(`worker ${worker.process.pid} exited (${code}), restarting`);
    cluster.fork();
  });
} else {
  await import("./main.js");
}
