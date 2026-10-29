// Lab: TCP proxy between the functions and Postgres that adds a one-way delay → RTT = 2 × DELAY_MS.
// Reproduces "function in Ohio, database in Frankfurt" on a laptop.
//   node scripts/lab/delay-proxy.mjs <listen-port> <postgres-port> <one-way-delay-ms>
import net from 'node:net'
const [listen, target, delay] = [Number(process.argv[2]), Number(process.argv[3]), Number(process.argv[4])]
net.createServer((c) => {
  const u = net.connect(target, 'localhost')
  const pipe = (from, to) => from.on('data', (d) => setTimeout(() => to.write(d), delay))
  pipe(c, u); pipe(u, c)
  const end = () => { c.destroy(); u.destroy() }
  c.on('error', end); u.on('error', end); c.on('close', end); u.on('close', end)
}).listen(listen, () => console.log(`delay proxy :${listen} → :${target} (+${delay} ms each way)`))
