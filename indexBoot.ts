import { envBoot } from "./bootloader.js";

try {
    envBoot();
}catch(err){
    console.dir(err);
}