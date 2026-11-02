// The data host's utility process: owns the native SQLite file and serves the ports main
// attaches. Started by main with MANGAVERSE_DATA_HOST_DB naming the database file.
import { createDataHost } from '@app/db/host';
import { z } from 'zod';

const databasePath = process.env.MANGAVERSE_DATA_HOST_DB;
if (databasePath === undefined || databasePath.length === 0) {
  throw new Error('MANGAVERSE_DATA_HOST_DB is not set');
}

const host = createDataHost({ databasePath });
const parentMessage = z.object({ type: z.literal('attach') });

process.parentPort.on('message', (event) => {
  const [port] = event.ports;
  if (!parentMessage.safeParse(event.data).success || port === undefined) return;
  host.attach({
    postMessage: (reply) => port.postMessage(reply),
    onMessage: (listener) => {
      port.on('message', (message) => listener(message.data));
      port.start();
    },
    onClose: (listener) => port.once('close', listener),
  });
});

process.on('exit', () => host.close());
