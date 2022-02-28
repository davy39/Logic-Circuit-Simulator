import { isDefined, isNotNull, LogicValue, Unknown, typeOrUndefined } from "../utils"
import { ComponentBase, defineComponent } from "./Component"
import * as t from "io-ts"
import { drawWireLineToComponent, COLOR_MOUSE_OVER, COLOR_COMPONENT_BORDER, drawComponentName, GRID_STEP, COLOR_BACKGROUND, COLOR_COMPONENT_INNER_LABELS, drawLabel } from "../drawutils"
import { ContextMenuData, ContextMenuItem, ContextMenuItemPlacement, DrawContext, Orientation } from "./Drawable"
import { LogicEditor } from "../LogicEditor"
import { EdgeTrigger, Flipflop, FlipflopOrLatch } from "./FlipflopOrLatch"
import { tooltipContent } from "../htmlgen"

export const InputRandomDef =
    defineComponent(1, 1, t.type({
        type: t.literal("random"),
        prob1: typeOrUndefined(t.number),
        showProb: typeOrUndefined(t.boolean),
        trigger: typeOrUndefined(t.keyof(EdgeTrigger)),
        name: typeOrUndefined(t.string),
    }, "InputRandom"))


export type InputRandomRepr = typeof InputRandomDef.reprType

const InputRandomDefaults = {
    prob1: 0.5,
    showProb: false,
    trigger: EdgeTrigger.rising,
}

const GRID_WIDTH = 4
const GRID_HEIGHT = 6

const enum INPUT { Clock }
const enum OUTPUT { Out }

export class InputRandom extends ComponentBase<1, 1, InputRandomRepr, LogicValue> {

    private _prob1: number = InputRandomDefaults.prob1
    private _showProb: boolean = InputRandomDefaults.showProb
    private _lastClock: LogicValue = Unknown
    private _trigger: EdgeTrigger = InputRandomDefaults.trigger
    private _name: string | undefined = undefined

    public constructor(editor: LogicEditor, savedData: InputRandomRepr | null) {
        super(editor, false, savedData, {
            inOffsets: [[-3, +2, "w"]],
            outOffsets: [[+3, 0, "e"]],
        })
        if (isNotNull(savedData)) {
            if (isDefined(savedData.prob1)) {
                this._prob1 = Math.max(0, Math.min(1, savedData.prob1))
            }
            this._showProb = savedData.showProb ?? InputRandomDefaults.showProb
            this._trigger = savedData.trigger ?? InputRandomDefaults.trigger
            this._name = savedData.name
        }
        this.setInputsPreferSpike(INPUT.Clock)
    }

    override toJSON() {
        return {
            type: "random" as const,
            ...super.toJSONBase(),
            name: this._name,
            prob1: (this._prob1 !== InputRandomDefaults.prob1) ? this._prob1 : undefined,
            showProb: (this._showProb !== InputRandomDefaults.showProb) ? this._showProb : undefined,
            trigger: (this._trigger !== InputRandomDefaults.trigger) ? this._trigger : undefined,
        }
    }

    public get componentType() {
        return "in" as const
    }

    get unrotatedWidth() {
        return GRID_WIDTH * GRID_STEP
    }

    get unrotatedHeight() {
        return GRID_HEIGHT * GRID_STEP
    }

    override get allowsForcedOutputs() {
        return false
    }

    public override makeTooltip() {
        return tooltipContent("Valeur aléatoire", `À chaque coup d’horloge, la valeur de sortie sera 1 avec une probabilité de ${this._prob1}.`)
    }

    protected doRecalcValue(): LogicValue {
        const prevClock = this._lastClock
        const clock = this._lastClock = this.inputs[INPUT.Clock].value
        if (!Flipflop.isClockTrigger(this._trigger, prevClock, clock)) {
            // no change
            return this.value
        }
        const r = Math.random()
        return r < this._prob1
    }

    protected override propagateValue(newValue: LogicValue) {
        this.outputs[OUTPUT.Out].value = newValue
    }

    doDraw(g: CanvasRenderingContext2D, ctx: DrawContext) {
        const width = this.unrotatedWidth
        const height = this.unrotatedHeight
        const left = this.posX - width / 2
        const right = this.posX + width / 2
        const top = this.posY - height / 2

        g.fillStyle = COLOR_BACKGROUND
        g.strokeStyle = ctx.isMouseOver ? COLOR_MOUSE_OVER : COLOR_COMPONENT_BORDER
        g.lineWidth = 3

        g.beginPath()
        g.rect(left, top, width, height)
        g.fill()
        g.stroke()


        drawWireLineToComponent(g, this.outputs[OUTPUT.Out], right, this.outputs[OUTPUT.Out].posYInParentTransform, false)
        drawWireLineToComponent(g, this.inputs[INPUT.Clock], left, this.inputs[INPUT.Clock].posYInParentTransform, false)

        Flipflop.drawClockInput(g, left, this.inputs[INPUT.Clock], this._trigger)


        ctx.inNonTransformedFrame(ctx => {
            FlipflopOrLatch.drawStoredValue(g, this.outputs[0].value, this.posX, this.posY, 26)

            if (this._showProb) {
                const isVertical = Orientation.isVertical(this.orient)

                g.fillStyle = COLOR_COMPONENT_INNER_LABELS
                g.font = "9px sans-serif"
                g.textAlign = "center"
                g.textBaseline = "middle"
                const probTextLastPart = String(Math.round(this._prob1 * 100) / 100).substring(1)
                const probTextParts = ["P(1)", "=", probTextLastPart]
                if (isVertical) {
                    let currentOffset = -10
                    let offset = Math.abs(currentOffset)
                    if (this.orient === "s") {
                        currentOffset = -currentOffset
                        offset = -offset
                    }
                    for (const part of probTextParts) {
                        drawLabel(ctx, this.orient, part, "n", this.posX - currentOffset, top - 1)
                        currentOffset += offset
                    }
                } else {
                    const probText = probTextParts.join(" ")
                    drawLabel(ctx, this.orient, probText, "n", this.posX, top)
                }
            }


            if (isDefined(this._name)) {
                drawComponentName(g, ctx, this._name, this, false)
            }
        })
    }

    private doSetName(name: string | undefined) {
        this._name = name
        this.setNeedsRedraw("name changed")
    }

    private doSetShowProb(showProb: boolean) {
        this._showProb = showProb
        this.setNeedsRedraw("show probability changed")
    }

    protected override makeComponentSpecificContextMenuItems(): undefined | [ContextMenuItemPlacement, ContextMenuItem][] {

        const icon = this._showProb ? "check" : "none"
        const toggleShowProbItem = ContextMenuData.item(icon, "Montrer la probabilité",
            () => this.doSetShowProb(!this._showProb))

        return [
            ["mid", toggleShowProbItem],
            ["mid", ContextMenuData.sep()],
            ["mid", this.makeSetNameContextMenuItem(this._name, this.doSetName.bind(this))],
        ]
    }

}