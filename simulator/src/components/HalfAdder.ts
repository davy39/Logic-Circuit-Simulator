import { isHighImpedance, isUndefined, isUnknown, LogicValue, Unknown } from "../utils"
import { ComponentBase, defineComponent } from "./Component"
import * as t from "io-ts"
import { COLOR_BACKGROUND, COLOR_COMPONENT_BORDER, COLOR_COMPONENT_INNER_LABELS, COLOR_MOUSE_OVER, GRID_STEP, drawWireLineToComponent, drawLabel } from "../drawutils"
import { ContextMenuItem, ContextMenuItemPlacement, DrawContext } from "./Drawable"
import { tooltipContent, mods, div } from "../htmlgen"
import { LogicEditor } from "../LogicEditor"

const GRID_WIDTH = 4
const GRID_HEIGHT = 6

const enum INPUT {
    A, B,
}

const enum OUTPUT {
    S, C
}

export const HalfAdderDef =
    defineComponent(2, 2, t.type({
        type: t.literal("halfadder"),
    }, "HalfAdder"))

export type HalfAdderRepr = typeof HalfAdderDef.reprType

export class HalfAdder extends ComponentBase<2, 2, HalfAdderRepr, [LogicValue, LogicValue]> {

    public constructor(editor: LogicEditor, savedData: HalfAdderRepr | null) {
        super(editor, [false, false], savedData, {
            inOffsets: [[-4, -2, "w"], [-4, 2, "w"]],
            outOffsets: [[4, -2, "e"], [4, 2, "e"]],
        })
    }

    toJSON() {
        return {
            type: "halfadder" as const,
            ...this.toJSONBase(),
        }
    }

    public get componentType() {
        return "ic" as const
    }

    override getInputName(i: number): string | undefined {
        switch (i) {
            case INPUT.A: return "A"
            case INPUT.B: return "B"
        }
        return undefined
    }

    override getOutputName(i: number): string | undefined {
        switch (i) {
            case OUTPUT.S: return "S (somme)"
            case OUTPUT.C: return "C (retenue)"
        }
        return undefined
    }

    get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    public override makeTooltip() {
        return tooltipContent("Demi-additionneur", mods(
            div(`Additionne deux bits A et B et fournit un bit de somme S et une retenue de sortie C.`)
        ))
    }

    protected doRecalcValue(): [LogicValue, LogicValue] {
        const a = this.inputs[INPUT.A].value
        const b = this.inputs[INPUT.B].value

        if (isUnknown(a) || isUnknown(b) || isHighImpedance(a) || isHighImpedance(b)) {
            return [Unknown, Unknown]
        }

        const sum = (+a) + (+b)
        switch (sum) {
            case 0: return [false, false]
            case 1: return [true, false]
            case 2: return [false, true]
            default:
                console.log("ERROR: sum of halfadder is > 2")
                return [false, false]
        }
    }

    protected override propagateValue(newValue: [LogicValue, LogicValue]) {
        this.outputs[OUTPUT.S].value = newValue[OUTPUT.S]
        this.outputs[OUTPUT.C].value = newValue[OUTPUT.C]
    }

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {

        const width = GRID_WIDTH * GRID_STEP
        const height = GRID_HEIGHT * GRID_STEP

        const left = this.posX - width / 2
        const right = left + width

        g.fillStyle = COLOR_BACKGROUND
        g.lineWidth = 3
        if (ctx.isMouseOver) {
            g.strokeStyle = COLOR_MOUSE_OVER
        } else {
            g.strokeStyle = COLOR_COMPONENT_BORDER
        }

        g.beginPath()
        g.rect(this.posX - width / 2, this.posY - height / 2, width, height)
        g.fill()
        g.stroke()

        drawWireLineToComponent(g, this.inputs[INPUT.A], left - 2, this.inputs[INPUT.A].posYInParentTransform, true)
        drawWireLineToComponent(g, this.inputs[INPUT.B], left - 2, this.inputs[INPUT.B].posYInParentTransform, true)

        drawWireLineToComponent(g, this.outputs[OUTPUT.S], right + 2, this.outputs[OUTPUT.S].posYInParentTransform, true)
        drawWireLineToComponent(g, this.outputs[OUTPUT.C], right + 2, this.outputs[OUTPUT.C].posYInParentTransform, true)

        ctx.inNonTransformedFrame(ctx => {
            g.fillStyle = COLOR_COMPONENT_INNER_LABELS
            g.font = "11px sans-serif"

            drawLabel(ctx, this.orient, "A", "w", left, this.inputs[INPUT.A])
            drawLabel(ctx, this.orient, "B", "w", left, this.inputs[INPUT.B])

            drawLabel(ctx, this.orient, "S", "e", right, this.outputs[OUTPUT.S])
            drawLabel(ctx, this.orient, "C", "e", right, this.outputs[OUTPUT.C])
            
            g.fillStyle = COLOR_COMPONENT_BORDER
            g.font = "26px sans-serif"
            g.textAlign = "center"
            g.textBaseline = "middle"
            g.fillText("+", this.posX, this.posY - 2)
        })
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {
        const forceOutputItem = this.makeForceOutputsContextMenuItem()
        if (isUndefined(forceOutputItem)) {
            return []
        }
        return [
            ["mid", forceOutputItem],
        ]
    }


}