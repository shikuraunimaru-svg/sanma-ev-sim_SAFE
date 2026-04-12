import * as fs from 'fs';
import * as path from 'path';

const srcDir = 'c:/Users/shiku/OneDrive/デスクトップ/sanma-ev-sim_SAFE/src';
const devDir = path.join(srcDir, 'dev');

if (!fs.existsSync(devDir)) {
    fs.mkdirSync(devDir);
}

function traverseAndMove(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            if (fullPath === devDir) continue; // skip dev itself
            traverseAndMove(fullPath);
        } else {
            const isMatch = fullPath.includes('inspect_') || 
                            fullPath.includes('repro_') || 
                            fullPath.includes('verify_') || 
                            file === 'generateTables.ts' || 
                            file === 'tableGenerator.worker.ts' || 
                            file === 'test_req.ts';
            if (isMatch) {
                const targetPath = path.join(devDir, file);
                console.log(`Moving ${fullPath} to ${targetPath}`);
                fs.renameSync(fullPath, targetPath);
            }
        }
    }
}

traverseAndMove(srcDir);
