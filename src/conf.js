import {Pane} from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import mobile from "is-mobile";

class Conf {
    gui = null;

    runSimulation = true;

    wireframe = false;

    rotateCamera = false;

    stiffness = 0.25;

    friction = 0.5;

    sceneName = "cloth";

    constructor() {
        if (mobile()) {
        }
        this.updateParams();

    }

    updateParams() {

    }

    init() {
        const gui = new Pane()
        gui.registerPlugin(EssentialsPlugin);

        const stats = gui.addFolder({
            title: "stats",
            expanded: false,
        });
        this.fpsGraph = stats.addBlade({
            view: 'fpsgraph',
            label: 'fps',
            rows: 2,
        });

        this.settings = gui.addFolder({
            title: "settings",
            expanded: false,
        });

        this.sceneFolder = gui.addFolder({
            title: "scene",
            expanded: true,
        });

        this.sceneFolder.addBlade({
            view: 'list',
            //label: 'scene',
            options: [
                {text: 'prairie cloth', value: "cloth"},
                {text: 'autumn leaves', value: "autumn"},
                {text: 'sakura petals' , value: "sakura"},
            ],
            value: this.sceneName,
        }).on('change', (ev) => {
            this.sceneName = ev.value;
        });

        this.settings.addBinding(this, "rotateCamera");
        this.settings.addBinding(this, "runSimulation");
        this.settings.addBinding(this, "wireframe");

        this.settings.addBinding( this, 'stiffness', { min: 0.1, max: 0.5, step: 0.01 });
        this.settings.addBinding( this, 'friction', { min: 0.0, max: 1.0, step: 0.01 });

        this.gui = gui;
    }

    update() {
    }

    begin() {
        this.fpsGraph.begin();
    }
    end() {
        this.fpsGraph.end();
    }
}
export const conf = new Conf();