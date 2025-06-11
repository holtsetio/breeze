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
            content: "Realtime verlet-based cloth simulation in the Browser, using WebGPU and written in [ThreeJS](https://threejs.org) TSL.\n\n" +
                "View the source code [here](https://github.com/holtsetio/breeze/).\n\n" +
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
            content: "[Venus de Milo model](https://sketchfab.com/3d-models/venus-de-milo-903aa69c782a46619615e6df382c8045) by [chiwei](https://sketchfab.com/chiwei2333) and [Lanzi Luo](https://sketchfab.com/Thunk3D-Nancy).\n\n" +
                "[Qwantani Noon](https://polyhaven.com/a/qwantani_noon) HDRi background by [Greg Zaal](https://gregzaal.com/) and [Jarod Guest](https://polyhaven.com/all?a=Jarod%20Guest).\n\n" +
                "[Piazza Martin Lutero](https://polyhaven.com/a/piazza_martin_lutero) HDRi background by [Greg Zaal](https://gregzaal.com/) and [Rico Cilliers](https://www.artstation.com/rico_b3d).\n\n" +
                "[Ninomaru Teien](https://polyhaven.com/a/ninomaru_teien) HDRi background by [Greg Zaal](https://gregzaal.com/).\n\n" +
                "[Fabric texture](https://3dtextures.me/2024/06/21/fabric-lace-038/) by [3dtextures.me](https://3dtextures.me).\n\n" +
                "[Cherry petal texture](https://www.vecteezy.com/png/55531046-beautiful-cherry-blossom-petal-clipart-with-soft-elegance) by [Pram Samnak](https://www.vecteezy.com/members/pram106) on [Vecteezy](https://www.vecteezy.com/).\n\n" +
                "[Maple leaf texture](https://sketchfab.com/3d-models/low-poly-leaves-25c6b8f79b204be388ed4ea00f74f9a1) by [kaiinness](https://sketchfab.com/kaiinness).\n\n",
            markdown: true,
        });

    }
    setText(c) {
        this.textBlade.controller.view.element.innerHTML = '<div class="tp-induv_t"><p>' + c + '</p></div>';
        this.pane.refresh();
    }
}