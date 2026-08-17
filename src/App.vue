<script lang="ts">
import { container, openModal } from 'jenesius-vue-modal';
import { deserializeModel, download, exportJSON, importJSON } from './utils';
import { provide, nextTick } from 'vue';
import { undoRedoManager } from './CommandManager';
import Confirmation from './components/dialogs/Confirmation.vue';
import ReloadPrompt from './components/ReloadPrompt.vue';

export default {
  name: 'App',
  components: { WidgetContainerModal: container },
};
</script>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { setLocale, availableLocales } from './plugins/i18n';

import Welcome from '@/components/dialogs/Welcome.vue';
import Share from '@/components/dialogs/Share.vue';
import Changelog from '@/components/dialogs/Changelog.vue';
import Editor from '@/views/Editor.vue';
import Dialogs from '@/components/Dialogs.vue';
import { useProjectStore } from './store/project';
import { useAppStore } from './store/app';

import { VOnboardingWrapper, VOnboardingStep } from 'v-onboarding';
import 'v-onboarding/dist/style.css';

import { useI18n } from 'vue-i18n';
import { eventBus, EventType } from './EventBus';
const { t } = useI18n();

const onboardingWrapper = ref(null);
provide('onboardingWrapper', onboardingWrapper);

const file = ref(null);

const steps = computed(() => [
  {
    attachTo: { element: '#viewerControls' },
    content: {
      title: t('tour.viewerControls.title'),
      description: t('tour.viewerControls.description'),
    },
  },
  {
    attachTo: { element: '#viewerSettings' },
    content: {
      title: t('tour.viewerSettings.title'),
      description: t('tour.viewerSettings.description'),
    },
  },
  {
    attachTo: { element: '#bottomBar' },
    content: {
      title: t('tour.bottomBar.title'),
      description: t('tour.bottomBar.description'),
    },
  },
]);

onMounted(() => {
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && (e.key === '+' || e.key === '=' || e.key === '-')) {
      e.preventDefault();
    }

    // If CTRL+Z undo
    if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') {
      e.preventDefault();
      undoRedoManager.undo();
    }

    // If CTRL+SHIFT+Z redo
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyZ') {
      e.preventDefault();
      undoRedoManager.redo();
    }

    // Save project
    if (e.ctrlKey && e.code === 'KeyS') {
      e.preventDefault();
      saveProject();
    }

    // Open project
    if (e.ctrlKey && e.code === 'KeyO') {
      e.preventDefault();
      file.value.click();
    }
  });

  document.addEventListener(
    'wheel',
    function (e) {
      if (e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    { passive: false }
  );
});

const appStore = useAppStore();

onMounted(() => {
  const solver = useProjectStore().solver;
  const params = new URL(document.location as unknown as URL).searchParams;
  const name = params.get('model');
  const lang = params.get('lang');
  const inViewerMode = params.get('viewer');

  if (inViewerMode) {
    appStore.inViewerMode = true;
  } else if (!appStore.simpleMode) {
    if (!appStore.onboardingFinished) openModal(Welcome);
    else maybeShowChangelog();
  }

  if (name) {
    clearMesh(true, true);
    deserializeModel(name, solver, useProjectStore().dimensions);
    solve();

    const url = document.location.href;
    window.history.pushState({}, '', url.split('?')[0]);

    return;
  }

  if (lang && availableLocales.findIndex((l) => l.code === lang) >= 0) {
    appStore.locale = lang;
    const url = document.location.href;
    window.history.pushState({}, '', url.split('?')[0]);
  }

});

const solve = () => {
  useProjectStore().solve();
  nextTick(() => {
    eventBus.emit(EventType.FIT_CONTENT);
  });
};

const clearMesh = (clearMaterials = false, clearCrossSects = false) => {
  useProjectStore().solver.loadCases[0].solved = false;
  useProjectStore().solver.loadCases[0].prescribedBC = [];
  useProjectStore().solver.loadCases[0].nodalLoadList = [];
  useProjectStore().solver.loadCases[0].elementLoadList = [];
  useProjectStore().solver.domain.elements.clear();
  useProjectStore().solver.domain.nodes.clear();
  useProjectStore().dimensions = [];

  if (clearMaterials) {
    useProjectStore().solver.domain.materials.clear();
  }

  if (clearCrossSects) {
    useProjectStore().solver.domain.crossSections.clear();
  }

  undoRedoManager.clearHistory();
};

const shareMesh = () => {
  openModal(Share);
};

const currentAppVersion = APP_VERSION;

const maybeShowChangelog = () => {
  if (appStore.inViewerMode) return;
  if (!currentAppVersion) return;
  if (appStore.lastSeenChangelogVersion === currentAppVersion) return;
  openModal(Changelog);
};

onMounted(() => {
  setLocale(appStore.locale);
});

function preventDefaults(e) {
  e.preventDefault();
}

const events = ['dragenter', 'dragover', 'dragleave', 'drop'];

onMounted(() => {
  events.forEach((eventName) => {
    document.body.addEventListener(eventName, preventDefaults);
  });
});

function onDrop(e) {
  for (let i = 0; i < e.dataTransfer.files.length; i++) {
    const file = e.dataTransfer.files[i];
    const reader = new FileReader();
    reader.onload = function (e) {
      const text = e.target.result.toString();
      clearMesh(true, true);
      try {
        importJSON(JSON.parse(text));
        solve();
      } catch (e) {
        alert('Could not import the file. Please check the file format.');
      }
    };
    reader.readAsText(file);
  }
}

function openFile(e) {
  // check if no file uploaded
  if (!e.target.files.length) return;

  const file = e.target.files[0];
  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result.toString();
    clearMesh(true, true);

    try {
      importJSON(JSON.parse(text));
      solve();
    } catch (e) {
      alert('Could not import the file. Please check the file format.');
    }

    appStore.tab = 0;
    appStore.drawerOpen = false;
  };
  reader.readAsText(file);
}

const saveProject = () => {
  download('project.json', JSON.stringify(exportJSON()));
};

const app_version = currentAppVersion;
const app_released = APP_RELEASED;
const app_commit = APP_COMMIT;
</script>

<template>
  <v-app @drop.prevent="onDrop">
    <VOnboardingWrapper
      ref="onboardingWrapper"
      :steps="steps"
      :options="{
        popper: {
          modifiers: [
            {
              name: 'offset',
              options: {
                offset: [0, 10],
              },
            },
          ],
        },
        scrollToStep: {
          enabled: false,
        },
      }"
    >
      <template #default="{ previous, next, step, isFirst, isLast }">
        <VOnboardingStep>
          <div class="bg-white shadow rounded-lg" style="max-width: 400px">
            <div class="px-4 py-5 sm:p-6">
              <div class="sm:flex sm:items-center sm:justify-between">
                <div v-if="step.content">
                  <h3 v-if="step.content.title" class="text-lg font-medium leading-6 text-gray-900">
                    {{ step.content.title }}
                  </h3>
                  <div v-if="step.content.description" class="mt-2 max-w-xl text-sm text-gray-500">
                    <p>{{ step.content.description }}</p>
                  </div>
                </div>
                <div class="mt-5 space-x-4 sm:mt-0 sm:ml-6 sm:flex sm:flex-shrink-0 sm:items-center relative">
                  <template v-if="!isFirst">
                    <v-btn type="button" flat color="grey-lighten-3" @click="previous">
                      {{ $t('tour.previousButton') }}
                    </v-btn>
                  </template>
                  <v-btn type="button" color="primary" flat class="ml-1" @click="next">
                    {{ isLast ? $t('tour.finishButton') : $t('tour.nextButton') }}
                  </v-btn>
                </div>
              </div>
            </div>
          </div>
        </VOnboardingStep>
      </template>
    </VOnboardingWrapper>

    <v-app-bar v-if="!appStore.inViewerMode" app density="comfortable" class="app-header" flat>
      <v-app-bar-nav-icon aria-label="Open project menu" @click="appStore.drawerOpen = !appStore.drawerOpen" />

      <div class="brand-lockup" aria-label="EduBeam home">
        <span class="brand-mark"><v-icon icon="mdi-bridge" size="22" /></span>
        <span><strong>EduBeam</strong><small>Structural analysis</small></span>
      </div>

      <v-btn-toggle
        v-model="appStore.simpleMode"
        mandatory
        density="comfortable"
        color="primary"
        variant="outlined"
        divided
        class="mode-switch ml-6"
      >
        <v-btn :value="true" class="text-none" prepend-icon="mdi-view-dashboard-outline">
          <span class="mode-label-full">Quick beam</span><span class="mode-label-short">Quick</span>
        </v-btn>
        <v-btn :value="false" class="text-none" prepend-icon="mdi-vector-polyline">
          <span class="mode-label-full">Advanced model</span><span class="mode-label-short">Model</span>
        </v-btn>
      </v-btn-toggle>

      <v-spacer />

      <v-btn
        class="d-none d-md-inline-flex text-none"
        variant="text"
        prepend-icon="mdi-share-variant-outline"
        @click="shareMesh"
      >
        Share
      </v-btn>
      <v-btn
        class="d-none d-sm-inline-flex text-none"
        variant="text"
        prepend-icon="mdi-book-open-page-variant-outline"
        href="https://github.com/rahulcvwebsitehosting/edubeam#readme"
        target="_blank"
      >
        Help
      </v-btn>
      <v-btn icon="mdi-cog-outline" variant="text" aria-label="Settings" @click="appStore.openSettings()" />
    </v-app-bar>

    <v-navigation-drawer v-model="appStore.drawerOpen" temporary>
      <!-- <v-list-item prepend-avatar="https://randomuser.me/api/portraits/women/9.jpg" title="Jane Doe"></v-list-item> -->

      <v-divider></v-divider>

      <v-list density="compact" nav>
        <v-list-item
          prepend-icon="mdi-folder-open-outline"
          :title="$t('common.openProject')"
          value="home"
          @click="$refs.file.click()"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-folder-arrow-down-outline"
          :title="$t('common.saveProject')"
          value="about"
          @click="saveProject"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-share"
          :title="$t('common.shareModel')"
          value="share"
          @click="shareMesh"
        ></v-list-item>
        <v-list-item
          prepend-icon="mdi-delete-empty"
          :title="$t('common.clearMesh')"
          value="clear"
          @click="
            openModal(Confirmation, {
              title: t('confirmation.clearMesh.title'),
              message: t('confirmation.clearMesh.message'),
              success: (params) => clearMesh(params.checkboxes[0].value, params.checkboxes[1].value),
              checkboxes: [
                { label: t('confirmation.clearMesh.materials'), value: false },
                { label: t('confirmation.clearMesh.crossSections'), value: false },
              ],
            })
          "
        ></v-list-item>
      </v-list>
      <v-divider />
      <div class="pa-3 text-grey-darken-2" style="font-size: 12px">
        v{{ app_version }}<br />{{ new Date(app_released).toLocaleDateString(appStore.locale) }}
        {{ new Date(app_released).toLocaleTimeString(appStore.locale) }}<br />
        <span style="font-size: 10px">{{ app_commit }}</span>
      </div>
    </v-navigation-drawer>

    <v-navigation-drawer v-model="appStore.rightDrawerOpen" location="right" temporary :scrim="false">
      -
    </v-navigation-drawer>

    <v-main>
      <Editor />
    </v-main>

    <Dialogs />

    <widget-container-modal />

    <ReloadPrompt />
    <input ref="file" type="file" style="display: none" @change="openFile" />
  </v-app>
</template>

<style lang="scss">
.app-header {
  border-bottom: 1px solid #e2e8f0 !important;
  background: rgba(255, 255, 255, 0.98) !important;
  color: #0f172a !important;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 170px;
  user-select: none;
}

.brand-lockup > span:last-child,
.brand-lockup strong,
.brand-lockup small {
  display: block;
}

.brand-lockup strong {
  font-size: 15px;
  line-height: 1.15;
  letter-spacing: -0.015em;
}

.brand-lockup small {
  margin-top: 2px;
  color: #64748b;
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #1e40af;
  color: #fff;
}

.mode-switch {
  border-radius: 9px;
  overflow: hidden;
}

.mode-label-short {
  display: none;
}

@media (max-width: 700px) {
  .brand-lockup small {
    display: none;
  }
  .brand-lockup {
    min-width: 0;
  }
  .mode-switch {
    margin-left: 8px !important;
  }
  .mode-switch .v-btn {
    min-width: 68px !important;
    padding-inline: 10px !important;
  }
  .mode-switch .v-icon {
    font-size: 18px;
  }
  .mode-label-full {
    display: none;
  }
  .mode-label-short {
    display: inline;
    font-size: 11px;
  }
}

.line-height-1 {
  line-height: 1 !important;
}

.svgViewer {
  position: absolute;
  width: 100%;
}

svg {
  display: block;
}

svg text {
  cursor: default;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.mouse {
  font-size: 12px;
}

.selecting {
  position: absolute;
  border: 1px solid #2f00ff;
  background: rgba(0, 0, 255, 0.2);
}

.tooltip {
  font-size: 14px;
  position: absolute;
  margin-top: -6px;
  margin-left: 18px;
}

.tooltip .content {
  position: relative;
  background: rgba(255, 255, 255, 0.9);
  z-index: 100;
  padding: 3px 8px;
  //font-weight: bold;
  box-shadow: 1px 1px 1px #ddd;
}

.tooltip .content:after {
  content: '';
  position: absolute;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  left: -6px;
  top: 8px;
  border-right: 6px solid rgba(255, 255, 255, 0.9);
  z-index: 1000;
}

.inline-checkbox {
  .v-input--selection-controls__input {
    margin-right: 0px !important;
  }
}
</style>
