import {Pane} from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import mobile from "is-mobile";

class Conf {
    gui = null;

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