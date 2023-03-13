import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_MOUSE_OVER, displayValuesFromArray, drawWireLineToComponent, GRID_STEP, strokeAsWireLine } from "../drawutils"
import { div, mods, tooltipContent } from "../htmlgen"
import { IconName } from "../images"
import { LogicEditor } from "../LogicEditor"
import { S } from "../strings"
import { FixedArray, FixedArrayFill, FixedArraySize, FixedReadonlyArray, HighImpedance, isDefined, isNotNull, isUnknown, LogicValue, typeOrUndefined, Unknown } from "../utils"
import { ComponentBaseWithSubclassDefinedNodes, ComponentRepr, defineComponent, NodeVisual, NodeVisuals } from "./Component"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { WireStyles } from "./Wire"


type DemuxInputIndices<NumInputs extends FixedArraySize> = {
    I: FixedReadonlyArray<number, NumInputs>, // array of input indices
    S: ReadonlyArray<number>, // array of indices of selectors
}

type DemuxOutputIndices<NumOutputs extends FixedArraySize> = {
    Z: ReadonlyArray<FixedReadonlyArray<number, NumOutputs>>, // array of arrays of output indices
}

export function defineDemux<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize, N extends string>(numInputs: NumInputs, numOutputs: NumOutputs, jsonName: N, className: string) {
    return defineComponent(numInputs, numOutputs, t.type({
        type: t.literal(jsonName),
        showWiring: typeOrUndefined(t.boolean),
        disconnectedAsHighZ: typeOrUndefined(t.boolean),
    }, className))
}

type DemuxRepr<NumInputs extends FixedArraySize, NumOutputs extends FixedArraySize> =
    ComponentRepr<NumInputs, NumOutputs> & {
        showWiring: boolean | undefined,
        disconnectedAsHighZ: boolean | undefined,
    }

const DemuxDefaults = {
    showWiring: true,
    disconnectedAsHighZ: false,
}

export abstract class Demux<
    NumInputs extends FixedArraySize,
    NumOutputs extends FixedArraySize,
    Repr extends DemuxRepr<NumInputs, NumOutputs>
>
    extends ComponentBaseWithSubclassDefinedNodes<
        DemuxInputIndices<NumInputs>,
        DemuxOutputIndices<NumOutputs>,
        NumInputs, NumOutputs, Repr, FixedArray<LogicValue, NumOutputs>
    > {

    private static generateInOffsets(numFrom: number, numSel: number, numTo: number): NodeVisual[] {
        const offsets: NodeVisual[] = []

        // left inputs
        const compact = numTo >= 7
        const spacing = compact ? 1 : 2
        const numGroups = numTo / numFrom
        const addByGroupSep = numFrom > 1 ? 1 : 0
        const numLeftSlots = (numTo * spacing) / 2 + (numGroups - 1) * addByGroupSep
        const topOffset = spacing === 1 ? -Math.round(numFrom / 2) : -(numFrom - 1) / 2 * spacing
        const left = -1 - numSel
        const y = -(numLeftSlots - 1)
        const selY = y - 2
        for (let i = 0; i < numFrom; i++) {
            offsets.push([`A${i}`, left, topOffset + spacing * i, "w", "A"])
        }

        // top input selectors
        const topRight = numSel - 1
        for (let s = 0; s < numSel; s++) {
            offsets.push([`S${s}`, topRight - 2 * s, selY, "n", "S"])
        }
        return offsets
    }

    private static generateOutOffsets<NumOutputs extends FixedArraySize>(numFrom: number, numSel: number, numTo: NumOutputs): FixedArray<NodeVisual, NumOutputs> {
        const offsets: NodeVisual[] = []

        const compact = numTo >= 7
        const spacing = compact ? 1 : 2
        const numGroups = numTo / numFrom
        const addByGroupSep = numFrom > 1 ? 1 : 0
        const numLeftSlots = (numTo * spacing) / 2 + (numGroups - 1) * addByGroupSep

        const x = 1 + numSel
        let y = -(numLeftSlots - 1)

        // right outputs
        let groupLetter = "B"
        for (let i = 0; i < numTo; i++) {
            if (i !== 0 && i % numFrom === 0) {
                y += addByGroupSep * spacing
                groupLetter = String.fromCharCode(groupLetter.charCodeAt(0) + 1)
            }
            offsets.push([groupLetter + (i % numFrom), x, y, "e", groupLetter])
            y += spacing
        }
        return offsets as FixedArray<NodeVisual, NumOutputs>
    }

    protected static generateInputIndices<NumInputs extends FixedArraySize>(numFrom: NumInputs, numSel: number): DemuxInputIndices<NumInputs> {
        let ind = 0

        const I: Array<number> = []
        for (let o = 0; o < numFrom; o++) {
            I.push(ind++)
        }

        const S: Array<number> = []
        for (let s = 0; s < numSel; s++) {
            S.push(ind++)
        }
        return { I: I as FixedArray<number, NumInputs>, S }
    }

    protected static generateOutputIndices<NumOutputs extends FixedArraySize>(numFrom: number, numTo: NumOutputs): DemuxOutputIndices<NumOutputs> {
        let ind = 0
        const Z: Array<FixedArray<number, NumOutputs>> = []

        const numGroups = numTo / numFrom
        for (let g = 0; g < numGroups; g++) {
            const inds: Array<number> = []
            for (let o = 0; o < numFrom; o++) {
                inds.push(ind++)
            }
            Z.push(inds as FixedArray<number, NumOutputs>)
        }
        return { Z }
    }

    private static gridWidth(numSel: number): number {
        return 2 * numSel
    }

    private static gridHeight(numFrom: number, numTo: number): number {
        const compact = numTo >= 7
        const spacing = compact ? 1 : 2
        const numGroups = numTo / numFrom
        const addByGroupSep = numFrom > 1 ? 1 : 0
        const numLeftSlots = numTo + (numGroups - 1) * addByGroupSep
        return 1 + spacing * numLeftSlots
    }

    public readonly numGroups: number

    private _showWiring = DemuxDefaults.showWiring
    private _disconnectedAsHighZ = DemuxDefaults.disconnectedAsHighZ

    protected constructor(editor: LogicEditor, savedData: Repr | null,
        public readonly numFrom: FixedArraySize,
        public readonly numSel: FixedArraySize,
        public readonly numTo: NumOutputs,
    ) {
        super(editor,
            Demux.gridWidth(numSel), Demux.gridHeight(numFrom, numTo),
            Demux.generateInputIndices(numFrom, numSel),
            Demux.generateOutputIndices(numFrom, numTo),
            FixedArrayFill(false as LogicValue, numTo), savedData, {
                ins: Demux.generateInOffsets(numFrom, numSel, numTo),
                outs: Demux.generateOutOffsets(numFrom, numSel, numTo),
            } as unknown as NodeVisuals<NumInputs, NumOutputs>)
        this.numGroups = this.numTo / this.numFrom
        if (isNotNull(savedData)) {
            this._showWiring = savedData.showWiring ?? DemuxDefaults.showWiring
            this._disconnectedAsHighZ = savedData.disconnectedAsHighZ ?? DemuxDefaults.disconnectedAsHighZ
        }
    }

    protected override toJSONBase() {
        return {
            ...super.toJSONBase(),
            showWiring: (this._showWiring !== DemuxDefaults.showWiring) ? this._showWiring : undefined,
            disconnectedAsHighZ: (this._disconnectedAsHighZ !== DemuxDefaults.disconnectedAsHighZ) ? this._disconnectedAsHighZ : undefined,
        }
    }

    public get componentType() {
        return "ic" as const
    }

    public override makeTooltip() {
        return tooltipContent(undefined, mods(
            div(S.Components.Demux.tooltip.expand({ from: this.numFrom, to: this.numTo })) // TODO better tooltip
        ))
    }

    protected doRecalcValue(): FixedArray<LogicValue, NumOutputs> {
        const sels = this.inputValues(this.INPUT.S as any)
        const sel = displayValuesFromArray(sels, false)[1]

        if (isUnknown(sel)) {
            return FixedArrayFill(Unknown, this.numTo)
        }

        const values: Array<LogicValue> = []
        const disconnected = this._disconnectedAsHighZ ? HighImpedance : false
        for (let g = 0; g < this.numGroups; g++) {
            if (g === sel) {
                const inputs = this.inputValues(this.INPUT.I)
                for (const input of inputs) {
                    values.push(input)
                }
            } else {
                for (let i = 0; i < this.numFrom; i++) {
                    values.push(disconnected)
                }
            }
        }

        return values as FixedArray<LogicValue, NumOutputs>
    }

    protected override propagateValue(newValues: FixedArray<LogicValue, NumOutputs>) {
        for (let i = 0; i < newValues.length; i++) {
            this.outputs[i].value = newValues[i]
        }
    }

    protected doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = this.gridWidth * GRID_STEP
        const height = this.gridHeight * GRID_STEP
        const left = this.posX - width / 2
        const right = this.posX + width / 2
        const top = this.posY - height / 2
        const bottom = this.posY + height / 2

        // inputs
        for (let i = 0; i < this.INPUT.I.length; i++) {
            const inputi = this.inputs[this.INPUT.I[i]]
            drawWireLineToComponent(g, inputi, left, inputi.posYInParentTransform)
        }

        // selectors
        for (let i = 0; i < this.INPUT.S.length; i++) {
            const seli = this.inputs[this.INPUT.S[i]]
            drawWireLineToComponent(g, seli, seli.posXInParentTransform, top + 20)
        }


        // outputs
        for (const GROUP of this.OUTPUT.Z) {
            for (let i = 0; i < GROUP.length; i++) {
                const outputi = this.outputs[GROUP[i]]
                drawWireLineToComponent(g, outputi, right, outputi.posYInParentTransform)
            }
        }

        // background
        const outlinePath = new Path2D()
        const dy = (right - left) / 3
        outlinePath.moveTo(left, top + dy)
        outlinePath.lineTo(right, top)
        outlinePath.lineTo(right, bottom)
        outlinePath.lineTo(left, bottom - dy)
        outlinePath.closePath()
        g.fillStyle = COLOR_BACKGROUND
        g.fill(outlinePath)

        // wiring
        if (this._showWiring) {
            const neutral = this.editor.options.hideWireColors
            const sels = this.inputValues(this.INPUT.S as any)
            const sel = displayValuesFromArray(sels, false)[1]
            if (!isUnknown(sel)) {
                const from = this.INPUT.I
                const to = this.OUTPUT.Z[sel]
                const anchorDiffX = (right - left) / 3
                const wireStyleStraight = this.editor.options.wireStyle === WireStyles.straight

                for (let i = 0; i < from.length; i++) {
                    g.beginPath()
                    const fromNode = this.inputs[from[i]]
                    const fromY = fromNode.posYInParentTransform
                    const toY = this.outputs[to[i]].posYInParentTransform
                    g.moveTo(left + 1, fromY)
                    if (wireStyleStraight) {
                        g.lineTo(left + 3, fromY)
                        g.lineTo(right - 3, toY)
                        g.lineTo(right - 1, toY)
                    } else {
                        g.bezierCurveTo(
                            left + anchorDiffX, fromY, // anchor left
                            right - anchorDiffX, toY, // anchor right
                            right - 1, toY,
                        )
                    }
                    strokeAsWireLine(g, this.inputs[from[i]].value, fromNode.color, false, neutral)
                }
            }
        }

        // outline
        g.lineWidth = 3
        if (ctx.isMouseOver) {
            g.strokeStyle = COLOR_MOUSE_OVER
        } else {
            g.strokeStyle = COLOR_COMPONENT_BORDER
        }
        g.stroke(outlinePath)

    }

    private doSetShowWiring(showWiring: boolean) {
        this._showWiring = showWiring
        this.setNeedsRedraw("show wiring changed")
    }

    private doSetDisconnectedAsHighZ(disconnectedAsHighZ: boolean) {
        this._disconnectedAsHighZ = disconnectedAsHighZ
        this.setNeedsRecalc()
    }


    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {

        const s = S.Components.Demux.contextMenu
        let icon: IconName = this._showWiring ? "check" : "none"
        const toggleShowWiringItem = ContextMenuData.item(icon, S.Components.Mux.contextMenu.ShowWiring, () => {
            this.doSetShowWiring(!this._showWiring)
        })

        icon = this._disconnectedAsHighZ ? "check" : "none"
        const toggleUseHighZItem = ContextMenuData.item(icon, s.UseZForDisconnected, () => {
            this.doSetDisconnectedAsHighZ(!this._disconnectedAsHighZ)
        })

        const items: [ContextMenuItemPlacement, ContextMenuItem][] = [
            ["mid", toggleShowWiringItem],
            ["mid", toggleUseHighZItem],
        ]

        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isDefined(forceOutputItem)) {
            items.push(
                ["mid", ContextMenuData.sep()],
                ["mid", forceOutputItem]
            )
        }

        return items
    }

}



export const Demux1To2Def = defineDemux(2, 2, "demux-1to2", "Demux1To2")
export type Demux1To2Repr = typeof Demux1To2Def.reprType
export class Demux1To2 extends Demux<2, 2, Demux1To2Repr> {

    public constructor(editor: LogicEditor, savedData: Demux1To2Repr | null) {
        super(editor, savedData, 1, 1, 2)
    }

    public toJSON() {
        return {
            type: "demux-1to2" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Demux1To4Def = defineDemux(3, 4, "demux-1to4", "Demux1To4")
export type Demux1To4Repr = typeof Demux1To4Def.reprType
export class Demux1To4 extends Demux<3, 4, Demux1To4Repr> {

    public constructor(editor: LogicEditor, savedData: Demux1To4Repr | null) {
        super(editor, savedData, 1, 2, 4)
    }

    public toJSON() {
        return {
            type: "demux-1to4" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Demux1To8Def = defineDemux(4, 8, "demux-1to8", "Demux1To8")
export type Demux1To8Repr = typeof Demux1To8Def.reprType
export class Demux1To8 extends Demux<4, 8, Demux1To8Repr> {

    public constructor(editor: LogicEditor, savedData: Demux1To8Repr | null) {
        super(editor, savedData, 1, 3, 8)
    }

    public toJSON() {
        return {
            type: "demux-1to8" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Demux2To4Def = defineDemux(3, 4, "demux-2to4", "Demux2To4")
export type Demux2To4Repr = typeof Demux2To4Def.reprType
export class Demux2To4 extends Demux<3, 4, Demux2To4Repr> {

    public constructor(editor: LogicEditor, savedData: Demux2To4Repr | null) {
        super(editor, savedData, 2, 1, 4)
    }

    public toJSON() {
        return {
            type: "demux-2to4" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Demux2To8Def = defineDemux(4, 8, "demux-2to8", "Demux2To8")
export type Demux2To8Repr = typeof Demux2To8Def.reprType
export class Demux2To8 extends Demux<4, 8, Demux2To8Repr> {

    public constructor(editor: LogicEditor, savedData: Demux2To8Repr | null) {
        super(editor, savedData, 2, 2, 8)
    }

    public toJSON() {
        return {
            type: "demux-2to8" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Demux4To8Def = defineDemux(5, 8, "demux-4to8", "Demux4To8")
export type Demux4To8Repr = typeof Demux4To8Def.reprType
export class Demux4To8 extends Demux<5, 8, Demux4To8Repr> {

    public constructor(editor: LogicEditor, savedData: Demux4To8Repr | null) {
        super(editor, savedData, 4, 1, 8)
    }

    public toJSON() {
        return {
            type: "demux-4to8" as const,
            ...this.toJSONBase(),
        }
    }
}

export const Demux8To16Def = defineDemux(9, 16, "demux-8to16", "Demux8To16")
export type Demux8To16Repr = typeof Demux8To16Def.reprType
export class Demux8To16 extends Demux<9, 16, Demux8To16Repr> {

    public constructor(editor: LogicEditor, savedData: Demux8To16Repr | null) {
        super(editor, savedData, 8, 1, 16)
    }

    public toJSON() {
        return {
            type: "demux-8to16" as const,
            ...this.toJSONBase(),
        }
    }
}
