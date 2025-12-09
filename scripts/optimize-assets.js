import { NodeIO } from '@gltf-transform/core';
import { simplify, cloneDocument } from '@gltf-transform/functions';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3d'; // <--- NIEUW: Importeer Draco
import fs from 'fs';
import path from 'path';

// Configuratie
const INPUT_DIR = './raw_assets';
const OUTPUT_DIR = './assets';

async function main() {
    // 1. Initialiseer IO met Draco support
    // We moeten wachten op de decoder modules, dus dit doen we binnen een async functie
    const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            'draco3d.decoder': await draco3d.createDecoderModule(),
            'draco3d.encoder': await draco3d.createEncoderModule(),
        });

    // Zorg dat de output map bestaat
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log("🚀 Starting asset optimization...");

    const files = fs.readdirSync(INPUT_DIR);

    for (const file of files) {
        if (!file.endsWith('.glb')) continue;

        const inputPath = path.join(INPUT_DIR, file);

        try {
            const doc = await io.read(inputPath);

            // A. Maak de LOW versie
            const lowDoc = await cloneDocument(doc);
            await lowDoc.transform(
                simplify({ simplifier: MeshoptSimplifier, ratio: 0.1, error: 0.01 })
            );
            await io.write(path.join(OUTPUT_DIR, file.replace('.glb', '_low.glb')), lowDoc);
            console.log(`✅ ${file} -> Low poly generated`);

            // B. Maak de HIGH versie (kopie van origineel)
            // Tip: Als je high-res ook wilt compressen zonder quality loss, kun je hier transform aanroepen
            // Voor nu schrijven we het origineel gewoon weg.
            await io.write(path.join(OUTPUT_DIR, file.replace('.glb', '_high.glb')), doc);
            console.log(`✅ ${file} -> High poly copied`);

        } catch (error) {
            console.error(`❌ Fout bij verwerken van ${file}:`, error.message);
        }
    }
}

// Start het script
main().catch(err => console.error(err));