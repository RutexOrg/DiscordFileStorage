import Dirent from "memfs/lib/Dirent";
import { Volume } from "memfs/lib/volume.js";

// TODO: 
export default function getFilesRecursive(fs: Volume, initial: string, paths: string[] = []) {
    const entries = fs.readdirSync(initial, { withFileTypes: true });
    for (const entry of entries) {
        const entryPath = initial + "/" + (entry as Dirent).name;
        if ((entry as Dirent).isDirectory()) {
            getFilesRecursive(fs, entryPath, paths);
        } else {
            paths.push(entryPath);
        }
    }
    return paths;
}