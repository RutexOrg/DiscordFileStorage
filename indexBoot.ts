import { bootDefault } from "./bootloader.js";

try {
    bootDefault();
}catch(err){
    console.dir(err);
}