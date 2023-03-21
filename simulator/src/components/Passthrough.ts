import { Either } from "fp-ts/lib/Either"
import * as t from "io-ts"
import { COLOR_COMPONENT_BORDER, COLOR_NODE_MOUSE_OVER, COLOR_UNKNOWN, drawWireLineToComponent, GRID_STEP, useCompact } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { ArrayFillWith, isDefined, isUndefined, LogicValue, Mode, typeOrUndefined, validate } from "../utils"
import { ComponentBase, defineParametrizedComponent, groupVertical, Params, Repr } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { NodeIn, NodeOut } from "./Node"
import { WireStyle } from "./Wire"


export const Slant = {
    none: "none",
    up: "up",
    down: "down",
} as const

export type Slant = keyof typeof Slant


export const PassthroughDef =
    defineParametrizedComponent("layout", "pass", true, true, {
        variantName: ({ bits }) => `pass-${bits}`,
        button: { imgWidth: 32 },
        repr: {
            bits: typeOrUndefined(t.number),
            slant: typeOrUndefined(t.keyof(Slant)),
        },
        valueDefaults: {
            slant: Slant.none,
        },
        paramDefaults: {
            bits: 1,
        },
        validateParams: ({ bits }, defaults) => {
            const numBits = validate(bits, [1, 2, 4, 8, 16], defaults.bits, "Passthrough width")
            return { numBits }
        },
        size: ({ numBits }) => ({
            gridWidth: 2,
            gridHeight: useCompact(numBits) ? numBits : 2 * numBits,
        }),
        makeNodes: ({ numBits }) => ({
            ins: {
                I: groupVertical("w", -1, 0, numBits),
            },
            outs: {
                O: groupVertical("e", +1, 0, numBits),
            },
        }),
        initialValue: (savedData, { numBits }) => ArrayFillWith<LogicValue>(false, numBits),
    })

export type PassthroughRepr = Repr<typeof PassthroughDef>
export type PassthroughParams = Params<typeof PassthroughDef>


export class Passthrough extends ComponentBase<PassthroughRepr> {

    public readonly numBits: number
    private _slant: Slant
    private _hShift: [number, number]

    public constructor(editor: LogicEditor, initData: Either<PassthroughParams, PassthroughRepr>) {
        const [params, savedData] = PassthroughDef.validate(initData)
        super(editor, PassthroughDef(params), savedData)
        this.numBits = params.numBits
        this._hShift = [0, 0] // updated by updateNodeOffsets
        this._slant = savedData?.slant ?? PassthroughDef.aults.slant
        this.updateNodeOffsets()
    }

    public toJSON() {
        return {
            type: "pass" as const,
            bits: this.numBits === PassthroughDef.aults.bits ? undefined : this.numBits,
            ...this.toJSONBase(),
            slant: this._slant === PassthroughDef.aults.slant ? undefined : this._slant,
        }
    }

    public override destroy(): void {
        type SavedNodeProps = WireStyle | undefined
        type EndNodes = [NodeIn, SavedNodeProps][]

        const savedWireEnds: [NodeOut, EndNodes][] = []
        for (let i = 0; i < this.numBits; i++) {
            const nodeOut = this.inputs.I[i].incomingWire?.startNode
            if (isUndefined(nodeOut) || !(nodeOut instanceof NodeOut)) {
                continue
            }
            const nodeIns: EndNodes = []
            for (const wire of this.outputs.O[i].outgoingWires) {
                const endNode = wire.endNode
                if (endNode !== null) {
                    nodeIns.push([endNode, wire.style])
                }
            }
            if (nodeIns.length > 0) {
                savedWireEnds.push([nodeOut, nodeIns])
            }
        }

        super.destroy()

        if (savedWireEnds.length > 0) {
            const wireMgr = this.editor.wireMgr
            for (const [nodeOut, nodeIns] of savedWireEnds) {
                for (const [nodeIn, style] of nodeIns) {
                    wireMgr.addNode(nodeOut)
                    const wire = wireMgr.addNode(nodeIn)
                    if (isUndefined(wire)) {
                        console.error("Failed to add wire back")
                        continue
                    }
                    // restore wire properties
                    if (isDefined(style)) {
                        wire.doSetStyle(style)
                    }
                }
            }
        }
    }

    public override get alwaysDrawMultiOutNodes() {
        return true
    }

    protected doRecalcValue(): LogicValue[] {
        return this.inputValues(this.inputs.I)
    }

    protected override propagateValue(newValue: LogicValue[]): void {
        this.outputValues(this.outputs.O, newValue)
    }

    public override isOver(x: number, y: number): boolean {
        if (this._slant === Slant.none) {
            return super.isOver(x, y)
        }

        let yPosWithNoHOffset = 0
        let f = 0
        switch (this._slant) {
            case Slant.up:
                yPosWithNoHOffset = this.inputs.I[0].posY
                f = -1
                break
            case Slant.down:
                yPosWithNoHOffset = this.inputs.I[this.numBits - 1].posY
                f = 1
                break
        }

        const deltaX = (y - yPosWithNoHOffset) * f
        return super.isOver(x + deltaX, y)
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Passthrough.tooltip)
        ))
    }


    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const width = 3
        const height = this.unrotatedHeight
        const top = this.posY - height / 2
        const bottom = top + height
        const left = this.posX - width / 2
        const right = left + width
        const mouseoverMargin = 4
        const [topShift, bottomShift] = this._hShift

        g.beginPath()
        g.moveTo(this.posX + topShift, top)
        g.lineTo(this.posX + bottomShift, bottom)

        if (ctx.isMouseOver) {
            g.lineWidth = width + mouseoverMargin * 2
            g.strokeStyle = COLOR_NODE_MOUSE_OVER
            g.stroke()

            g.strokeStyle = COLOR_COMPONENT_BORDER
        } else {
            g.strokeStyle = COLOR_UNKNOWN
        }

        if (this.editor.mode >= Mode.CONNECT) {
            g.lineWidth = width
            g.stroke()
        }

        for (const input of this.inputs._all) {
            drawWireLineToComponent(g, input, left + 2 + ((input.gridOffsetX + 1) * GRID_STEP), input.posYInParentTransform)
        }

        for (const output of this.outputs._all) {
            drawWireLineToComponent(g, output, right - 2 + ((output.gridOffsetX - 1) * GRID_STEP), output.posYInParentTransform)
        }
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {

        if (this.numBits > 1) {
            const s = S.Components.Passthrough.contextMenu

            const makeItemSetSlant = (desc: string, slant: Slant) => {
                const isCurrent = this._slant === slant
                const icon = isCurrent ? "check" : "none"
                const action = isCurrent ? () => undefined : () => this.doSetSlant(slant)
                return ContextMenuData.item(icon, desc, action)
            }

            return [
                ["mid", ContextMenuData.submenu("slanted", s.Slant, [
                    makeItemSetSlant(s.SlantNone, Slant.none),
                    ContextMenuData.sep(),
                    makeItemSetSlant(s.SlantRight, Slant.down),
                    makeItemSetSlant(s.SlantLeft, Slant.up),
                ])],
            ]
        } else {
            return undefined
        }

    }

    private doSetSlant(slant: Slant) {
        this._slant = slant
        this.updateNodeOffsets()
        this.setNeedsRedraw("slant changed")
    }

    private updateNodeOffsets() {
        const n = this.numBits
        switch (this._slant) {
            case "none":
                for (let i = 0; i < n; i++) {
                    this.inputs.I[i].gridOffsetX = -1
                    this.outputs.O[i].gridOffsetX = +1
                }
                this._hShift = [0, 0]
                break
            case "down": {
                const f = n > 4 ? 1 : 2
                for (let i = 0; i < n; i++) {
                    const shift = f * (n - 1 - i)
                    this.inputs.I[i].gridOffsetX = -1 + shift
                    this.outputs.O[i].gridOffsetX = +1 + shift
                }
                this._hShift = [f * (n - 0.5) * GRID_STEP, -f * GRID_STEP / 2]
                break
            }
            case "up": {
                const f = n > 4 ? 1 : 2
                for (let i = 0; i < n; i++) {
                    const shift = f * i
                    this.inputs.I[i].gridOffsetX = -1 + shift
                    this.outputs.O[i].gridOffsetX = +1 + shift
                }
                this._hShift = [-f * GRID_STEP / 2, f * (n - 0.5) * GRID_STEP]
                break
            }
        }

    }

}
