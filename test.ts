import FolderTree from "./src/file/filesystem/FolderTree";
import Folder from "./src/file/filesystem/Folder";
import ServerFile from "./src/file/ServerFile";

async function main(){
    let fs = new FolderTree().getRoot();
    let a = new Folder("a");
    let b = new Folder("b");

    let a1 = new ServerFile("a.txt", 0, a);
    let b1 = new ServerFile("b.txt", 0, b);
    
    fs.addFolder(a);
    fs.addFolder(b);

    fs.moveFolder(b, a);

    console.log(b1.getAbsolutePath())

    fs.printHierarchyWithFiles(true);
}
main();