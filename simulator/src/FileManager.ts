import { logicInputs, logicOutputs, gates, clocks, wireMng, saveProjectFile, displays, displaysA, displaysB, isNullOrUndefined, isString, allComponents, isUndefined } from "./simulator.js"
import { LogicInput } from "./circuit_components/LogicInput.js"
import { LogicOutput } from "./circuit_components/LogicOutput.js"
import { Clock } from "./circuit_components/Clock.js"
import { Gate, GateBase, GateFactory } from "./circuit_components/Gate.js"
import { ICType } from "./circuit_components/Enums.js"
import { stringifySmart } from "./stringifySmart.js"
import { FourBitDisplay } from "./circuit_components/FourBitDisplay.js"
import { AsciiDisplay } from "./circuit_components/AsciiDisplay.js"
import { Wire } from "./circuit_components/Wire.js"
import { BarDisplay } from "./circuit_components/BarDisplay.js"
import { clearLiveNodes, findNode } from "./circuit_components/Component.js"

// let eventHistory = []

export class FileManager {

    public isLoadingState = false

    loadFile(e: Event) {
        const sourceElem = e.target as HTMLInputElement
        const file = sourceElem.files?.item(0)
        if (!file) {
            return
        }

        const reader = new FileReader()

        reader.onload = () => {
            const contentFile = reader.result
            //console.log(contentFile);
            if (isString(contentFile)) {
                this.doLoadFromJson(contentFile)
            }
        }
        reader.readAsText(file)
    }

    doLoadFromJson(content: string | any): boolean {
        this.isLoadingState = true

        let parsedContents: any
        if (!isString(content)) {
            parsedContents = content
        } else {
            try {
                parsedContents = JSON.parse(content)
            } catch (err) {
                console.log("Can't load this JSON, " + err)
                console.log(content)
                return false
            }
        }

        for (const elems of allComponents) {
            elems.splice(0, elems.length)
        }
        wireMng.wires.splice(0, wireMng.wires.length)
        clearLiveNodes()

        type JsonReprOf<T extends { toJSON(): any }> = ReturnType<T["toJSON"]>

        if ("in" in parsedContents) {
            for (let i = 0; i < parsedContents.in.length; i++) {
                const parsedVals = parsedContents.in[i] as JsonReprOf<LogicInput>
                logicInputs.push(new LogicInput(parsedVals))
            }
        }

        if ("out" in parsedContents) {
            for (let i = 0; i < parsedContents.out.length; i++) {
                const parsedVals = parsedContents.out[i] as JsonReprOf<LogicOutput>
                logicOutputs.push(new LogicOutput(parsedVals))
            }
        }

        if ("displays" in parsedContents) {
            for (let i = 0; i < parsedContents.displays.length; i++) {
                const parsedVals = parsedContents.displays[i] as JsonReprOf<FourBitDisplay>
                displays.push(new FourBitDisplay(parsedVals))
            }
        }

        if ("displaysA" in parsedContents) {
            for (let i = 0; i < parsedContents.displaysA.length; i++) {
                const parsedVals = parsedContents.displaysA[i] as JsonReprOf<AsciiDisplay>
                displaysA.push(new AsciiDisplay(parsedVals))
            }
        }

        if ("displaysB" in parsedContents) {
            for (let i = 0; i < parsedContents.displaysB.length; i++) {
                const parsedVals = parsedContents.displaysB[i] as JsonReprOf<BarDisplay>
                displaysB.push(new BarDisplay(parsedVals))
            }
        }

        if ("clocks" in parsedContents) {
            for (let i = 0; i < parsedContents.clocks.length; i++) {
                const parsedVals = parsedContents.displaysB[i] as JsonReprOf<Clock>
                clocks.push(new Clock(parsedVals))
            }
        }

        if ("gates" in parsedContents) {
            for (let i = 0; i < parsedContents.gates.length; i++) {
                const parsedVals = parsedContents.gates[i] as JsonReprOf<Gate>
                gates.push(GateFactory.make(parsedVals))
            }
        }

        // if ("srLatches" in parsedContents) {
        //     for (let i = 0; i < parsedContents.srLatches.length; i++) {
        //         const parsedVals = parsedContents.srLatches[i]

        //         let newObj = null
        //         switch (parsedContents.srLatch[i].type) {
        //             case ICType.SR_LATCH_ASYNC:
        //                 newObj = new SR_LatchAsync(parsedVals.gateType,
        //                     parsedVals.stabilize)
        //                 srLatches.push()
        //                 break
        //             case ICType.SR_LATCH_SYNC:
        //                 newObj = new SR_LatchSync(parsedVals.gateType,
        //                     parsedVals.stabilize)
        //                 break
        //         }

        //         if (newObj) {
        //             Object.assign(newObj, parsedVals) // TODO too generic
        //             newObj.refreshNodes()

        //             srLatches.push(newObj)
        //         }
        //     }
        // }

        // if ("flipflops" in parsedContents) {
        //     for (let i = 0; i < parsedContents.flipflops.length; i++) {
        //         const parsedVals = parsedContents.flipflops[i]

        //         let newObj = null
        //         switch (parsedVals.type) {
        //             case ICType.FF_D_SINGLE:
        //                 newObj = new FF_D_Single()
        //                 break
        //             case ICType.FF_D_MASTERSLAVE:
        //                 newObj = new FF_D_MasterSlave()
        //                 break
        //             case ICType.FF_T:
        //                 newObj = new FF_T(parsedVals.isNegativeEdgeTrig)
        //                 break
        //             case ICType.FF_JK:
        //                 newObj = new FF_JK(parsedVals.isNegativeEdgeTrig)
        //                 break
        //         }

        //         if (newObj) {
        //             Object.assign(newObj, parsedVals) // TODO too generic
        //             newObj.refreshNodes()
        //             flipflops.push(newObj)
        //         }
        //     }
        // }

        if ("wires" in parsedContents) {
            for (let i = 0; i < parsedContents.wires.length; i++) {
                const parsedVals = parsedContents.wires[i] as JsonReprOf<Wire>
                if (isNullOrUndefined(parsedVals[1])) {
                    continue
                }
                const node1 = findNode(parsedVals[0])
                const node2 = findNode(parsedVals[1])
                if (isUndefined(node1) || isUndefined(node2)) {
                    continue
                }
                wireMng.addNode(node1)
                wireMng.addNode(node2)
            }
        }

        return true
    }


    saveFile() {
        const jsonWorkspace = FileManager.getJSON_Workspace()
        const blob = new Blob([jsonWorkspace], { type: 'application/json' })
        if (saveProjectFile) {
            saveProjectFile.href = URL.createObjectURL(blob)
        }
    }

    static getJSON_Workspace() {
        const workspace: any = {}

        if (logicInputs.length) { workspace["in"] = logicInputs }
        if (logicOutputs.length) { workspace["out"] = logicOutputs }
        if (displays.length) { workspace["displays"] = displays }
        if (displaysA.length) { workspace["displaysA"] = displaysA }
        if (displaysB.length) { workspace["displaysB"] = displaysB }
        if (clocks.length) { workspace["clocks"] = clocks }
        if (gates.length) { workspace["gates"] = gates }
        // if (flipflops.length) { workspace["flipflops"] = flipflops }
        // if (srLatches.length) { workspace["srLatches"] = srLatches }
        if (wireMng.wires.length) { workspace["wires"] = wireMng.wires }

        console.log(workspace)

        const jsonStr = stringifySmart(workspace, {
            replacer: function (key, value) {
                // filter out the values of all these keys
                // TODO: should be done in toJSON() method
                switch (key) {
                    case "output":
                    case "input":
                    case "nodeSet":
                    case "nodeReset":
                    case "nodeClock":
                    case "nodeD":
                    case "nodeT":
                    case "nodeJ":
                    case "nodeK":
                    case "nodeQ":
                    case "nodeNotQ":
                    case "andGate_NotQ":
                    case "andGate_Q":
                    case "ff_D":
                    case "orGate":
                    case "gateSet":
                    case "gateReset":
                    case "asyncLatch":
                    case "master":
                    case "slave":
                    case "srLatchSync":
                    case "startNode":
                    case "endNode":
                        return undefined
                }

                // other things which is not possible to export on JSON
                return value
            },
        })

        console.log(jsonStr)

        return jsonStr
    }
}