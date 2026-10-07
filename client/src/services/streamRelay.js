/**
 * Adapter module: Redirects legacy stream relay calls to the modern torrent swarm seeder
 */
export {
  startTorrentSeederService as startStreamRelayService,
  stopTorrentSeederService as stopStreamRelayService,
  startTorrentSeederService,
  stopTorrentSeederService,
} from './torrentEngine';
