import { bootApp, bootApp as launch } from "./bootloader.js";

try {
    launch();
}catch(err){
    console.dir(err);
}