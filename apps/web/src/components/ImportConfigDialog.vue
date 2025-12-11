<template>
  <v-dialog
    v-model="dialog"
    max-width="600"
    :persistent="dialogBehavior.persistent.value"
    :no-click-animation="dialogBehavior.noClickAnimation"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>{{ isEdit ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
        {{ isEdit ? 'Edit Import Configuration' : 'Create Import Configuration' }}
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" @submit.prevent="save">
          <v-text-field
            v-model="form.name"
            label="Configuration Name *"
            :rules="[v => !!v || 'Name is required']"
            hint="A friendly name for this import configuration"
            persistent-hint
            class="mb-4"
          />

          <v-select
            v-model="form.priceListCode"
            :items="priceListOptions"
            label="Target Price List *"
            :disabled="isEdit || !!props.priceListCode"
            :rules="[v => !!v || 'Price list is required']"
            class="mb-4"
          />

          <v-select
            v-model="form.sourceType"
            :items="sourceTypeOptions"
            label="Source Type *"
            :rules="[v => !!v || 'Source type is required']"
            class="mb-4"
          />

          <v-select
            v-model="form.format"
            :items="formatOptions"
            label="Data Format *"
            :rules="[v => !!v || 'Format is required']"
            hint="Flat: ticker + price per row. Pivot: tickers as rows. KAWA: 2-row per commodity"
            persistent-hint
            class="mb-4"
          />

          <template v-if="form.sourceType === 'google_sheets'">
            <v-text-field
              v-model="form.sheetsUrl"
              label="Google Sheets URL"
              hint="The full URL of the Google Sheet"
              persistent-hint
              class="mb-4"
            />

            <v-text-field
              v-model.number="form.sheetGid"
              label="Sheet GID (Tab)"
              type="number"
              hint="Leave empty for the first tab, or specify the gid parameter from the URL"
              persistent-hint
              class="mb-4"
            />
          </template>

          <v-expansion-panels v-if="form.format === 'pivot'" class="mb-4">
            <v-expansion-panel title="Pivot Format Help">
              <v-expansion-panel-text>
                <p class="text-body-2 mb-2">
                  Pivot format expects data arranged like a spreadsheet:
                </p>
                <v-table density="compact" class="mb-2">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Montem</th>
                      <th>Vallis</th>
                      <th>Benten</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>DW</td>
                      <td>50</td>
                      <td>52</td>
                      <td>48</td>
                    </tr>
                    <tr>
                      <td>RAT</td>
                      <td>120</td>
                      <td>125</td>
                      <td>118</td>
                    </tr>
                  </tbody>
                </v-table>
                <p class="text-caption text-medium-emphasis">
                  The first column should contain commodity tickers. Column headers should match
                  location names or IDs (e.g., "Montem", "MON", "Vallis", "VH-331a").
                </p>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>

          <v-expansion-panels v-if="form.format === 'kawa'" class="mb-4">
            <v-expansion-panel title="KAWA Format Help">
              <v-expansion-panel-text>
                <p class="text-body-2 mb-2">
                  KAWA format uses 2 rows per commodity. Location names are in the commodity's info
                  row (not header), with prices directly below:
                </p>
                <v-table density="compact" class="mb-2">
                  <thead>
                    <tr class="text-medium-emphasis">
                      <th>A</th>
                      <th>B</th>
                      <th>C</th>
                      <th>D</th>
                      <th>E</th>
                      <th>F</th>
                      <th>G</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr class="text-disabled">
                      <td colspan="4">Updated 2023-Feb-19</td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                    <tr class="text-disabled">
                      <td>Category</td>
                      <td>Ticker</td>
                      <td>Material</td>
                      <td>Source</td>
                      <td>...</td>
                      <td></td>
                      <td></td>
                    </tr>
                    <tr>
                      <td>Consumables</td>
                      <td class="font-weight-bold">DW</td>
                      <td>Drinking Water</td>
                      <td>KW-602c</td>
                      <td class="text-info">Montem</td>
                      <td class="text-info">Vallis</td>
                      <td class="text-info">Benten</td>
                    </tr>
                    <tr>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td class="text-success">24</td>
                      <td class="text-success">25</td>
                      <td class="text-success">26</td>
                    </tr>
                    <tr>
                      <td></td>
                      <td class="font-weight-bold">RAT</td>
                      <td>Basic Rations</td>
                      <td>Milliways</td>
                      <td class="text-info">Montem</td>
                      <td class="text-info">Katoa</td>
                      <td class="text-info">Umbra</td>
                    </tr>
                    <tr>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td class="text-success">39</td>
                      <td class="text-success">40</td>
                      <td class="text-success">41</td>
                    </tr>
                  </tbody>
                </v-table>
                <p class="text-caption text-medium-emphasis">
                  <strong>Ticker</strong> in column B,
                  <strong class="text-info">locations</strong> in columns E+ of the info row,
                  <strong class="text-success">prices</strong> in the row below. Each commodity can
                  have different locations.
                </p>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </v-form>

        <v-alert
          v-if="errorMessage"
          type="error"
          class="mt-4"
          closable
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn color="primary" :loading="saving" @click="save">
          {{ isEdit ? 'Save Changes' : 'Create' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  api,
  type ImportConfigResponse,
  type ImportSourceType,
  type ImportFormat,
  type PriceListDefinition,
} from '../services/api'
import { useDialogBehavior } from '../composables'

const props = defineProps<{
  modelValue: boolean
  config?: ImportConfigResponse | null
  priceListCode?: string | null // Pre-fill for new configs
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved', config: ImportConfigResponse): void
}>()

const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const dialogBehavior = useDialogBehavior({ modelValue: dialog })

const isEdit = computed(() => !!props.config)

const formRef = ref()
const form = ref({
  name: '',
  priceListCode: '',
  sourceType: 'google_sheets' as ImportSourceType,
  format: 'flat' as ImportFormat,
  sheetsUrl: '' as string | null,
  sheetGid: null as number | null,
})
const saving = ref(false)
const errorMessage = ref('')
const priceLists = ref<PriceListDefinition[]>([])

const sourceTypeOptions = [
  { title: 'Google Sheets', value: 'google_sheets' },
  { title: 'CSV File', value: 'csv' },
]

const formatOptions = [
  { title: 'Flat (ticker, price per row)', value: 'flat' },
  { title: 'Pivot (tickers as rows, locations as columns)', value: 'pivot' },
  { title: 'KAWA (2-row format: ticker row + price row)', value: 'kawa' },
]

const priceListOptions = computed(() => {
  return priceLists.value.map(pl => ({
    title: `${pl.code} - ${pl.name}`,
    value: pl.code,
  }))
})

const loadPriceLists = async () => {
  try {
    priceLists.value = await api.priceLists.list()
  } catch (error) {
    console.error('Failed to load price lists:', error)
  }
}

const save = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    errorMessage.value = ''

    let result: ImportConfigResponse

    if (isEdit.value && props.config) {
      result = await api.importConfigs.update(props.config.id, {
        name: form.value.name,
        sheetsUrl: form.value.sheetsUrl || null,
        sheetGid: form.value.sheetGid,
      })
    } else {
      result = await api.importConfigs.create({
        name: form.value.name,
        priceListCode: form.value.priceListCode,
        sourceType: form.value.sourceType,
        format: form.value.format,
        sheetsUrl: form.value.sheetsUrl || null,
        sheetGid: form.value.sheetGid,
      })
    }

    emit('saved', result)
    close()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to save import config'
  } finally {
    saving.value = false
  }
}

const close = () => {
  dialog.value = false
}

// Reset form when dialog opens/closes
watch(dialog, open => {
  if (open && props.config) {
    // Edit mode - populate form
    form.value = {
      name: props.config.name,
      priceListCode: props.config.priceListCode,
      sourceType: props.config.sourceType,
      format: props.config.format,
      sheetsUrl: props.config.sheetsUrl,
      sheetGid: props.config.sheetGid,
    }
  } else if (open) {
    // Create mode - reset form with optional pre-fill
    form.value = {
      name: '',
      priceListCode: props.priceListCode || '',
      sourceType: 'google_sheets',
      format: 'flat',
      sheetsUrl: null,
      sheetGid: null,
    }
  }
  errorMessage.value = ''
})

onMounted(() => {
  loadPriceLists()
})
</script>
