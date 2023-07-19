import Dirent from "memfs/lib/Dirent";
import { Volume } from "memfs/lib/volume.js";

export default function getFilesaPathsRecursive(fs: Volume, initial: string, paths: string[] = []) {
    const entries = fs.readdirSync(initial, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = initial + "/" + (entry as Dirent).name;
        if ((entry as Dirent).isDirectory()) {
            getFilesaPathsRecursive(fs, entryPath, paths);
        } else {
            paths.push(entryPath);
        }
    }
    return paths;
}
