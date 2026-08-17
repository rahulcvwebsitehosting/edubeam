<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRefs } from 'vue';
import { DofID, Beam2D } from 'ts-fem';
import SVGViewer from './SVGViewer.vue';
import { useProjectStore } from '@/store/project';
import { useViewerStore } from '@/store/viewer';
import { useAppStore } from '@/store/app';
import { eventBus, EventType } from '@/EventBus';

type SupportType = 'simply-supported' | 'cantilever' | 'fixed-fixed' | 'propped';
type LoadType = 'udl' | 'point' | 'moment' | 'trapezoidal';

const projectStore = useProjectStore();
const viewerStore = useViewerStore();
const appStore = useAppStore();

const step = ref(1);
const {
  beamLength,
  supportType,
  youngsModulus,
  sectionArea,
  secondMoment,
  loadType,
  loadMagnitude,
  loadEndMagnitude,
  loadPosition,
} = toRefs(appStore.quickBeam);
const solveState = ref<'idle' | 'solving' | 'solved' | 'error'>('idle');

const steps = [
  { id: 1, label: 'Beam', icon: 'mdi-vector-line' },
  { id: 2, label: 'Supports', icon: 'mdi-triangle-outline' },
  { id: 3, label: 'Section', icon: 'mdi-alpha-i-box-outline' },
  { id: 4, label: 'Loads', icon: 'mdi-arrow-down-bold' },
];

const supportOptions = [
  {
    value: 'simply-supported',
    title: 'Simply supported',
    caption: 'Pin at A, roller at B',
    icon: 'mdi-triangle-outline',
  },
  { value: 'cantilever', title: 'Cantilever', caption: 'Fixed at A, free at B', icon: 'mdi-ray-start-arrow' },
  {
    value: 'fixed-fixed',
    title: 'Fixed at both ends',
    caption: 'No end translation or rotation',
    icon: 'mdi-arrow-collapse-horizontal',
  },
  { value: 'propped', title: 'Propped cantilever', caption: 'Fixed at A, roller at B', icon: 'mdi-table-row' },
];

const materialPresets = [
  { title: 'Structural steel', e: 200, caption: 'E = 200 GPa' },
  { title: 'Aluminium', e: 69, caption: 'E = 69 GPa' },
  { title: 'Concrete', e: 30, caption: 'E = 30 GPa' },
  { title: 'Timber', e: 11, caption: 'E = 11 GPa' },
];

const loadOptions = [
  { value: 'udl', title: 'Uniform load', icon: 'mdi-arrow-collapse-down' },
  { value: 'point', title: 'Point load', icon: 'mdi-arrow-down-bold' },
  { value: 'moment', title: 'Applied moment', icon: 'mdi-rotate-right' },
  { value: 'trapezoidal', title: 'Varying load', icon: 'mdi-chart-timeline-variant' },
];

const positionRules = computed(() => [
  (value: number) => value >= 0 || 'Position must be on the beam.',
  (value: number) => value <= beamLength.value || `Maximum position is ${beamLength.value} m.`,
]);

const modelIsSolved = computed(() => projectStore.solver.loadCases[0]?.solved === true);

const beamResult = computed(() => {
  if (!modelIsSolved.value) return { deflection: 0, moment: 0, shear: 0 };

  let deflection = 0;
  let moment = 0;
  let shear = 0;

  for (const element of projectStore.solver.domain.elements.values()) {
    if (!(element instanceof Beam2D)) continue;
    const def = element.computeGlobalDefl(projectStore.solver.loadCases[0], 60);
    const m = element.computeBendingMoment(projectStore.solver.loadCases[0], 60).M as number[];
    const v = element.computeShearForce(projectStore.solver.loadCases[0], 60).V as number[];

    deflection = Math.max(deflection, ...def.w.map((value) => Math.abs(value)));
    moment = Math.max(moment, ...m.map((value) => Math.abs(value)));
    shear = Math.max(shear, ...v.map((value) => Math.abs(value)));
  }

  return { deflection, moment, shear };
});

const formattedResults = computed(() => [
  {
    label: 'Max deflection',
    value: `${(beamResult.value.deflection * 1000).toFixed(2)} mm`,
    icon: 'mdi-chart-bell-curve-cumulative',
    color: '#2563eb',
  },
  {
    label: 'Max moment',
    value: `${(beamResult.value.moment / 1000).toFixed(2)} kNm`,
    icon: 'mdi-chart-areaspline',
    color: '#7c3aed',
  },
  {
    label: 'Max shear',
    value: `${(beamResult.value.shear / 1000).toFixed(2)} kN`,
    icon: 'mdi-chart-timeline-variant',
    color: '#dc2626',
  },
]);

const selectedSupport = computed(() => supportOptions.find((option) => option.value === supportType.value));

const clearModel = () => {
  const solver = projectStore.solver;
  solver.codeNumberGenerated = false;
  solver.loadCases[0].solved = false;
  solver.loadCases[0].prescribedBC = [];
  solver.loadCases[0].nodalLoadList = [];
  solver.loadCases[0].elementLoadList = [];
  solver.domain.elements.clear();
  solver.domain.nodes.clear();
  solver.domain.materials.clear();
  solver.domain.crossSections.clear();
  projectStore.dimensions = [];
};

const buildAndSolve = async () => {
  solveState.value = 'solving';

  try {
    clearModel();
    const solver = projectStore.solver;
    const domain = solver.domain;
    const length = Math.max(0.1, Number(beamLength.value));
    const position = Math.min(length, Math.max(0, Number(loadPosition.value)));

    const startSupports: DofID[] = [];
    const endSupports: DofID[] = [];

    if (supportType.value === 'simply-supported') {
      startSupports.push(DofID.Dx, DofID.Dz);
      endSupports.push(DofID.Dz);
    } else if (supportType.value === 'cantilever') {
      startSupports.push(DofID.Dx, DofID.Dz, DofID.Ry);
    } else if (supportType.value === 'fixed-fixed') {
      startSupports.push(DofID.Dx, DofID.Dz, DofID.Ry);
      endSupports.push(DofID.Dx, DofID.Dz, DofID.Ry);
    } else {
      startSupports.push(DofID.Dx, DofID.Dz, DofID.Ry);
      endSupports.push(DofID.Dz);
    }

    domain.createNode('A', [0, 0, 0], startSupports);
    domain.createNode('B', [length, 0, 0], endSupports);
    domain.createMaterial('Material', {
      e: Number(youngsModulus.value) * 1e9,
      g: (Number(youngsModulus.value) * 1e9) / (2 * (1 + 0.3)),
      alpha: 12e-6,
      d: 7850,
    });
    domain.createCrossSection('Section', {
      a: Number(sectionArea.value) * 1e-4,
      iy: Number(secondMoment.value) * 1e-8,
      h: 0.2,
      k: 0.833,
    });
    domain.createBeam2D('B1', ['A', 'B'], 'Material', 'Section');

    const magnitude = Number(loadMagnitude.value) * 1000;
    if (loadType.value === 'udl') {
      solver.loadCases[0].createBeamElementUniformEdgeLoad('B1', [0, magnitude], true);
    } else if (loadType.value === 'point') {
      solver.loadCases[0].createBeamConcentratedLoad('B1', [0, magnitude, 0, position], true);
    } else if (loadType.value === 'moment') {
      solver.loadCases[0].createBeamConcentratedLoad('B1', [0, 0, magnitude, position], true);
    } else {
      solver.loadCases[0].createBeamElementTrapezoidalEdgeLoad(
        'B1',
        [0, magnitude],
        [0, Number(loadEndMagnitude.value) * 1000],
        true
      );
    }

    domain.nodes = new Map(domain.nodes);
    domain.elements = new Map(domain.elements);
    domain.materials = new Map(domain.materials);
    domain.crossSections = new Map(domain.crossSections);

    projectStore.solve();
    await nextTick();
    await new Promise((resolve) => window.setTimeout(resolve, 100));

    if (!solver.loadCases[0].solved) throw new Error('The model could not be solved.');

    viewerStore.showLoads = true;
    viewerStore.showSupports = true;
    viewerStore.showReactions = true;
    viewerStore.showDeformedShape = true;
    viewerStore.showNormalForce = false;
    viewerStore.showShearForce = false;
    viewerStore.showBendingMoment = true;
    solveState.value = 'solved';
    eventBus.emit(EventType.FIT_CONTENT);
  } catch (error) {
    console.error(error);
    solveState.value = 'error';
  }
};

const nextStep = () => {
  if (step.value < 4) step.value += 1;
  else buildAndSolve();
};

onMounted(() => {
  if (projectStore.solver.domain.elements.size === 0) buildAndSolve();
  else {
    solveState.value = modelIsSolved.value ? 'solved' : 'idle';
    requestAnimationFrame(() => eventBus.emit(EventType.FIT_CONTENT));
  }
});
</script>

<template>
  <div class="guided-workspace">
    <aside class="workflow-panel" aria-label="Beam setup">
      <div class="workflow-heading">
        <div>
          <p class="eyebrow">Quick beam</p>
          <h1>Build your beam</h1>
          <p>Set the essentials. EduBeam handles the structural model.</p>
        </div>
        <v-chip v-if="modelIsSolved" color="success" size="small" variant="tonal" prepend-icon="mdi-check-circle">
          Solved
        </v-chip>
      </div>

      <nav class="step-navigation" aria-label="Beam setup steps">
        <button
          v-for="item in steps"
          :key="item.id"
          type="button"
          :class="['step-button', { active: step === item.id, complete: step > item.id }]"
          :aria-current="step === item.id ? 'step' : undefined"
          @click="step = item.id"
        >
          <span class="step-index"><v-icon :icon="step > item.id ? 'mdi-check' : item.icon" size="18" /></span>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="step-content">
        <section v-if="step === 1" aria-labelledby="beam-step-title">
          <div class="section-title">
            <span>01</span>
            <div>
              <h2 id="beam-step-title">Beam geometry</h2>
              <p>Start with the clear span.</p>
            </div>
          </div>
          <v-text-field
            v-model.number="beamLength"
            label="Beam length"
            suffix="m"
            type="number"
            min="0.1"
            step="0.1"
            variant="outlined"
            hide-details="auto"
          />
          <div class="help-card">
            <v-icon icon="mdi-information-outline" size="20" />
            <span>You can create multiple spans and inclined members in Advanced model.</span>
          </div>
        </section>

        <section v-else-if="step === 2" aria-labelledby="support-step-title">
          <div class="section-title">
            <span>02</span>
            <div>
              <h2 id="support-step-title">Support condition</h2>
              <p>Choose how the beam is restrained.</p>
            </div>
          </div>
          <div class="option-grid">
            <button
              v-for="option in supportOptions"
              :key="option.value"
              type="button"
              :class="['option-card', { selected: supportType === option.value }]"
              @click="supportType = option.value as SupportType"
            >
              <v-icon :icon="option.icon" size="24" />
              <span
                ><strong>{{ option.title }}</strong
                ><small>{{ option.caption }}</small></span
              >
              <v-icon v-if="supportType === option.value" icon="mdi-check-circle" color="primary" size="20" />
            </button>
          </div>
        </section>

        <section v-else-if="step === 3" aria-labelledby="section-step-title">
          <div class="section-title">
            <span>03</span>
            <div>
              <h2 id="section-step-title">Material & section</h2>
              <p>Define the beam stiffness.</p>
            </div>
          </div>
          <v-select
            :model-value="materialPresets.find((item) => item.e === youngsModulus)?.title ?? 'Custom'"
            :items="materialPresets"
            item-title="title"
            label="Material preset"
            variant="outlined"
            hide-details="auto"
            @update:model-value="
              (title) => (youngsModulus = materialPresets.find((item) => item.title === title)?.e ?? youngsModulus)
            "
          />
          <div class="field-row">
            <v-text-field
              v-model.number="youngsModulus"
              label="Young’s modulus"
              suffix="GPa"
              type="number"
              variant="outlined"
              hide-details="auto"
            />
            <v-text-field
              v-model.number="sectionArea"
              label="Area"
              suffix="cm²"
              type="number"
              variant="outlined"
              hide-details="auto"
            />
          </div>
          <v-text-field
            v-model.number="secondMoment"
            label="Second moment of area, I"
            suffix="cm⁴"
            type="number"
            variant="outlined"
            hide-details="auto"
          />
        </section>

        <section v-else aria-labelledby="load-step-title">
          <div class="section-title">
            <span>04</span>
            <div>
              <h2 id="load-step-title">Apply load</h2>
              <p>Positive values act downward.</p>
            </div>
          </div>
          <div class="load-type-grid">
            <button
              v-for="option in loadOptions"
              :key="option.value"
              type="button"
              :class="['load-type', { selected: loadType === option.value }]"
              @click="loadType = option.value as LoadType"
            >
              <v-icon :icon="option.icon" size="21" />
              <span>{{ option.title }}</span>
            </button>
          </div>
          <div class="field-row">
            <v-text-field
              v-model.number="loadMagnitude"
              :label="loadType === 'trapezoidal' ? 'Start magnitude' : 'Magnitude'"
              :suffix="loadType === 'udl' || loadType === 'trapezoidal' ? 'kN/m' : loadType === 'moment' ? 'kNm' : 'kN'"
              type="number"
              variant="outlined"
              hide-details="auto"
            />
            <v-text-field
              v-if="loadType === 'point' || loadType === 'moment'"
              v-model.number="loadPosition"
              label="Position from A"
              suffix="m"
              type="number"
              variant="outlined"
              :rules="positionRules"
              hide-details="auto"
            />
            <v-text-field
              v-else-if="loadType === 'trapezoidal'"
              v-model.number="loadEndMagnitude"
              label="End magnitude"
              suffix="kN/m"
              type="number"
              variant="outlined"
              hide-details="auto"
            />
          </div>
          <div class="model-summary">
            <div>
              <span>Span</span><strong>{{ beamLength }} m</strong>
            </div>
            <div>
              <span>Support</span><strong>{{ selectedSupport?.title }}</strong>
            </div>
            <div>
              <span>Material</span><strong>{{ youngsModulus }} GPa</strong>
            </div>
          </div>
        </section>
      </div>

      <div class="workflow-actions">
        <v-btn v-if="step > 1" variant="text" prepend-icon="mdi-arrow-left" class="text-none" @click="step -= 1"
          >Back</v-btn
        >
        <span v-else />
        <v-btn
          color="primary"
          size="large"
          class="text-none px-6"
          :loading="solveState === 'solving'"
          :prepend-icon="step === 4 ? 'mdi-play' : undefined"
          @click="nextStep"
        >
          {{ step === 4 ? 'Analyze beam' : 'Continue' }}
          <v-icon v-if="step < 4" icon="mdi-arrow-right" end />
        </v-btn>
      </div>
    </aside>

    <main class="analysis-stage">
      <div class="stage-toolbar">
        <div>
          <p class="eyebrow">Analysis canvas</p>
          <h2>{{ selectedSupport?.title }} · {{ beamLength }} m</h2>
        </div>
        <div class="view-toggles" aria-label="Result display controls">
          <v-btn-toggle color="primary" density="comfortable" variant="outlined" divided>
            <v-btn
              :active="viewerStore.showDeformedShape"
              class="text-none"
              @click="viewerStore.showDeformedShape = !viewerStore.showDeformedShape"
              >Deflection</v-btn
            >
            <v-btn
              :active="viewerStore.showShearForce"
              class="text-none"
              @click="viewerStore.showShearForce = !viewerStore.showShearForce"
              >Shear</v-btn
            >
            <v-btn
              :active="viewerStore.showBendingMoment"
              class="text-none"
              @click="viewerStore.showBendingMoment = !viewerStore.showBendingMoment"
              >Moment</v-btn
            >
          </v-btn-toggle>
        </div>
      </div>

      <div class="canvas-card">
        <SVGViewer id="guided-viewer" />
        <div v-if="solveState === 'error'" class="solve-error" role="alert">
          <v-icon icon="mdi-alert-circle-outline" />
          The model could not be solved. Check the inputs and try again.
        </div>
      </div>

      <section class="result-strip" aria-label="Key analysis results">
        <article v-for="result in formattedResults" :key="result.label" class="result-card">
          <div class="result-icon" :style="{ color: result.color, backgroundColor: `${result.color}12` }">
            <v-icon :icon="result.icon" size="24" />
          </div>
          <div>
            <span>{{ result.label }}</span
            ><strong>{{ modelIsSolved ? result.value : '—' }}</strong>
          </div>
        </article>
        <article class="result-card status-card">
          <div class="result-icon"><v-icon icon="mdi-shield-check-outline" size="24" /></div>
          <div>
            <span>Analysis status</span
            ><strong>{{ modelIsSolved ? 'Linear model solved' : 'Ready to analyze' }}</strong>
          </div>
        </article>
      </section>
    </main>
  </div>
</template>

<style scoped lang="scss">
.guided-workspace {
  display: grid;
  grid-template-columns: minmax(330px, 390px) 1fr;
  height: 100%;
  min-height: 0;
  background: #f4f7fb;
  color: #0f172a;
}
.workflow-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
  border-right: 1px solid #e2e8f0;
  box-shadow: 4px 0 18px rgba(15, 23, 42, 0.04);
  z-index: 3;
}
.workflow-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 24px 24px 18px;
  border-bottom: 1px solid #eef2f7;
}
.workflow-heading h1,
.stage-toolbar h2 {
  font-size: 22px;
  line-height: 1.25;
  letter-spacing: -0.025em;
  margin: 2px 0 5px;
}
.workflow-heading p:not(.eyebrow) {
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
  max-width: 260px;
}
.eyebrow {
  margin: 0;
  color: #2563eb;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.step-navigation {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  padding: 14px 16px;
  gap: 4px;
  border-bottom: 1px solid #eef2f7;
}
.step-button {
  appearance: none;
  border: 0;
  background: transparent;
  border-radius: 10px;
  padding: 8px 4px;
  color: #64748b;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}
.step-button:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.step-button:focus-visible,
.option-card:focus-visible,
.load-type:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.28);
  outline-offset: 2px;
}
.step-index {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin: 0 auto 5px;
  border: 1px solid #d8e1ec;
  border-radius: 9px;
  background: #fff;
}
.step-button.active {
  color: #1d4ed8;
  background: #eff6ff;
}
.step-button.active .step-index {
  color: #fff;
  background: #2563eb;
  border-color: #2563eb;
}
.step-button.complete .step-index {
  color: #047857;
  background: #ecfdf5;
  border-color: #a7f3d0;
}
.step-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
}
.section-title {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 22px;
}
.section-title > span {
  display: grid;
  place-items: center;
  flex: 0 0 32px;
  height: 32px;
  border-radius: 9px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 800;
}
.section-title h2 {
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.015em;
}
.section-title p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 13px;
}
.help-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 16px;
  padding: 13px;
  border: 1px solid #dbeafe;
  border-radius: 10px;
  background: #f8fbff;
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
}
.option-grid {
  display: grid;
  gap: 10px;
}
.option-card {
  display: grid;
  grid-template-columns: 30px 1fr 20px;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 64px;
  padding: 11px 13px;
  border: 1px solid #dfe7f0;
  border-radius: 11px;
  background: #fff;
  color: #334155;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;
}
.option-card:hover {
  border-color: #93c5fd;
  background: #f8fbff;
}
.option-card.selected {
  border-color: #60a5fa;
  background: #eff6ff;
  box-shadow: 0 0 0 1px #60a5fa;
}
.option-card strong,
.option-card small {
  display: block;
}
.option-card strong {
  color: #0f172a;
  font-size: 13px;
}
.option-card small {
  margin-top: 2px;
  color: #64748b;
  font-size: 11px;
}
.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 14px;
}
.load-type-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}
.load-type {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 9px 10px;
  border: 1px solid #dfe7f0;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: 0.2s ease;
}
.load-type:hover {
  border-color: #93c5fd;
}
.load-type.selected {
  color: #1d4ed8;
  border-color: #60a5fa;
  background: #eff6ff;
}
.model-summary {
  display: grid;
  gap: 8px;
  margin-top: 18px;
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.model-summary div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
}
.model-summary span {
  color: #64748b;
}
.model-summary strong {
  color: #334155;
  font-weight: 600;
  text-align: right;
}
.workflow-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
  background: #fff;
}
.analysis-stage {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 16px;
  min-width: 0;
  min-height: 0;
  padding: 20px;
}
.stage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 50px;
}
.stage-toolbar h2 {
  font-size: 18px;
  margin-bottom: 0;
}
.canvas-card {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: #fff;
  border: 1px solid #dde5ef;
  border-radius: 14px;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.06);
}
.canvas-card :deep(.svg-viewer) {
  background: linear-gradient(180deg, #fff 0%, #fbfdff 100%);
}
.canvas-card :deep(#viewerControls) {
  top: 16px !important;
  right: 16px !important;
}
.canvas-card :deep(#viewerSettings) {
  display: none !important;
}
.solve-error {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 10px 14px;
  border-radius: 9px;
  background: #fef2f2;
  color: #991b1b;
  box-shadow: 0 4px 14px rgba(127, 29, 29, 0.15);
  font-size: 13px;
}
.result-strip {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.result-card {
  display: flex;
  align-items: center;
  gap: 11px;
  min-width: 0;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.035);
}
.result-icon {
  display: grid;
  place-items: center;
  flex: 0 0 42px;
  height: 42px;
  border-radius: 10px;
  color: #047857;
  background: #ecfdf5;
}
.result-card span,
.result-card strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.result-card span {
  color: #64748b;
  font-size: 11px;
}
.result-card strong {
  margin-top: 2px;
  color: #0f172a;
  font-size: 15px;
}
.status-card strong {
  font-size: 13px;
}

@media (max-width: 1100px) {
  .guided-workspace {
    grid-template-columns: 340px 1fr;
  }
  .result-strip {
    grid-template-columns: 1fr 1fr;
  }
  .analysis-stage {
    padding: 14px;
  }
}

@media (max-width: 760px) {
  .guided-workspace {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }
  .workflow-panel {
    flex: 0 0 auto;
    border-right: 0;
    border-bottom: 1px solid #e2e8f0;
  }
  .step-content {
    overflow: visible;
  }
  .analysis-stage {
    min-height: 620px;
  }
  .stage-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .result-strip {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 480px) {
  .workflow-heading,
  .step-content {
    padding-left: 16px;
    padding-right: 16px;
  }
  .field-row,
  .result-strip {
    grid-template-columns: 1fr;
  }
  .view-toggles {
    width: 100%;
    overflow-x: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .step-button,
  .option-card,
  .load-type {
    transition: none;
  }
}
</style>
