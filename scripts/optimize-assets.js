import { NodeIO } from '@gltf-transform/core';
import { simplify, cloneDocument, resample } from '@gltf-transform/functions'; // <--- NIEUW: Importeer resample
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3d'; 
import fs from 'fs';
import path from 'path';

// Configuratie
const INPUT_DIR = './raw_assets';
const OUTPUT_DIR = './assets';

async function main() {
    // 1. Initialiseer IO met Draco support
    const io = new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
            'draco3d.decoder': await draco3d.createDecoderModule(),
            'draco3d.encoder': await draco3d.createEncoderModule(),
        });

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

            console.log(`Processing: ${file}`);

            // ⚡ STAP 1: Animaties Optimaliseren (Resample)
            // Dit doen we op het basis document VOORDAT we splitsen.
            // Dit haalt de 'baked' 60fps eruit en maakt er schone curves van.
            // tolerance: 0.001 is veilig voor hoge kwaliteit.
            await doc.transform(
                resample({ tolerance: 0.001 }) 
            );
            console.log(`   - Animations resampled (cleanup)`);

            // ⚡ STAP 2: Maak de LOW versie (Geometry Simplify)
            // Clone het document (dat nu al geoptimaliseerde animaties heeft)
            const lowDoc = await cloneDocument(doc);
            
            await lowDoc.transform(
                simplify({ simplifier: MeshoptSimplifier, ratio: 0.1, error: 0.01 })
            );
            
            await io.write(path.join(OUTPUT_DIR, file.replace('.glb', '_low.glb')), lowDoc);
            console.log(`   ✅ Saved _low.glb`);

            // ⚡ STAP 3: Maak de HIGH versie (Alleen Animatie optimalisatie)
            // We schrijven het originele doc (waar wel resample op is gedaan, maar geen simplify)
            await io.write(path.join(OUTPUT_DIR, file.replace('.glb', '_high.glb')), doc);
            console.log(`   ✅ Saved _high.glb`);

        } catch (error) {
            console.error(`❌ Fout bij verwerken van ${file}:`, error.message);
        }
    }
}

// Start het script
main().catch(err => console.error(err));