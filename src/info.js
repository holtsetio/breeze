import {Pane} from 'tweakpane';
import * as InfodumpPlugin from 'tweakpane-plugin-infodump';

export class Info {
    constructor() {
        const container = document.createElement('div');
        document.body.appendChild(container);
        container.style.position = 'absolute';
        container.style.left = '8px';
        container.style.bottom = '8px';
        container.style.maxWidth = '512px';
        container.style.width = 'calc(100% - 16px)';

        const pane = new Pane({ container })
        pane.registerPlugin(InfodumpPlugin);
        this.pane = pane;

        const info = pane.addFolder({
            title: "info",
            expanded: false,
        });
        this.textBlade = info.addBlade({
            view: "infodump",
            content: "Realtime MLS-MPM simulation in the Browser, using WebGPU and written in [ThreeJS](https://threejs.org) TSL. Inspired by the works of [Refik Anadol](https://refikanadol.com/).\n\n" +
                "MLS-MPM implementation is heavily based on [WebGPU-Ocean](https://github.com/matsuoka-601/WebGPU-Ocean) by [matsuoka-601](https://github.com/matsuoka-601).\n\n" +
                "[> Other experiments](https://holtsetio.com)",
            markdown: true,
        })

        const credits = info.addFolder({
            title: "credits",
            expanded: false,
        });
        credits.element.style.marginLeft = '0px';
        credits.addBlade({
            view: "infodump",
            content: "[HDRi background](https://polyhaven.com/a/autumn_field_puresky) by Jarod Guest and Sergej Majboroda on [Polyhaven.com](https://polyhaven.com).\n\n" +
                "[Concrete plaster wall texture](https://www.texturecan.com/details/216/) by [texturecan.com](https://texturecan.com).\n\n",
            markdown: true,
        });

    }
    setText(c) {
        this.textBlade.controller.view.element.innerHTML = '<div class="tp-induv_t"><p>' + c + '</p></div>';
        this.pane.refresh();
    }
}