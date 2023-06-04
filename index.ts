import { bootApp } from "./bootloader.js";

try {
    bootApp();
}catch(err){
    console.dir(err);
}