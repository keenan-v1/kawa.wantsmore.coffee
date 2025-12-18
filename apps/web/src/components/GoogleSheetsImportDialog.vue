<template>
  <v-dialog
    v-model="dialog"
    max-width="900"
    :persistent="dialogBehavior.persistent.value"
    :no-click-animation="dialogBehavior.noClickAnimation"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>mdi-google-spreadsheet</v-icon>
        Import Prices from Google Sheets
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <!-- Stepper -->
        <v-stepper v-model="step" :items="steps" hide-actions alt-labels class="elevation-0">
          <!-- Step 1: URL Entry -->
          <template #item.1>
            <v-card flat class="pa-4">
              <v-text-field
                v-model="sheetsUrl"
                label="Google Sheets URL"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                :rules="[
                  v => !!v || 'URL is required',
                  v => isValidSheetsUrl(v) || 'Invalid Google Sheets URL',
                ]"
                :error-messages="urlError"
                persistent-hint
                hint="The spreadsheet must be published to the web or shared with 'Anyone with the link'"
              >
                <template #prepend-inner>
                  <v-icon>mdi-link</v-icon>
                </template>
              </v-text-field>

              <v-alert type="info" variant="tonal" class="mt-4" density="compact">
                <div class="text-subtitle-2 mb-1">How to share your spreadsheet:</div>
                <ol class="text-body-2 pl-4 mb-0">
                  <li>Open your Google Sheet</li>
                  <li>Click File &gt; Share &gt; Publish to web</li>
                  <li>Select the sheet tab and choose "Comma-separated values (.csv)"</li>
                  <li>Click Publish and copy the URL</li>
                </ol>
              </v-alert>
            </v-card>
          </template>

          <!-- Step 2: Column Mapping -->
          <template #item.2>
            <v-card flat class="pa-4">
              <div v-if="loadingSheet" class="text-center py-8">
                <v-progress-circular indeterminate size="48" />
                <p class="mt-4">Fetching spreadsheet data...</p>
              </div>

              <template v-else>
                <v-row dense>
                  <v-col cols="12" sm="6">
                    <v-select
                      v-model="mapping.ticker"
                      :items="columnOptions"
                      label="Ticker Column *"
                      :rules="[v => v !== null || 'Required']"
                      density="compact"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-select
                      v-model="mapping.price"
                      :items="columnOptions"
                      label="Price Column *"
                      :rules="[v => v !== null || 'Required']"
                      density="compact"
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-select
                      v-model="mapping.location"
                      :items="optionalColumnOptions"
                      label="Location Column"
                      density="compact"
                      clearable
                      hint="Leave empty to use default location"
                      persistent-hint
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-select
                      v-model="mapping.currency"
                      :items="optionalColumnOptions"
                      label="Currency Column"
                      density="compact"
                      clearable
                      hint="Leave empty to use default currency"
                      persistent-hint
                    />
                  </v-col>
                </v-row>

                <v-divider class="my-4" />

                <v-row dense>
                  <v-col cols="12" sm="6">
                    <KeyValueAutocomplete
                      v-model="locationDefault"
                      :items="locationOptions"
                      label="Default Location"
                      :disabled="!!mapping.location"
                      density="compact"
                      clearable
                      :hint="
                        mapping.location
                          ? 'Using column value'
                          : 'Used when location column is empty'
                      "
                      persistent-hint
                    />
                  </v-col>
                  <v-col cols="12" sm="6">
                    <v-select
                      v-model="currencyDefault"
                      :items="currencies"
                      label="Default Currency"
                      :disabled="!!mapping.currency"
                      density="compact"
                      clearable
                      :hint="
                        mapping.currency
                          ? 'Using column value'
                          : 'Used when currency column is empty'
                      "
                      persistent-hint
                    />
                  </v-col>
                </v-row>

                <!-- Sample Data Preview -->
                <div v-if="sampleData.length > 0" class="mt-4">
                  <p class="text-subtitle-2 mb-2">Sample Data Preview</p>
                  <v-table density="compact" class="sample-table">
                    <thead>
                      <tr>
                        <th v-for="(header, i) in detectedHeaders" :key="i" class="text-caption">
                          {{ header }}
                          <v-chip
                            v-if="getMappingForColumn(i)"
                            size="x-small"
                            color="primary"
                            class="ml-1"
                          >
                            {{ getMappingForColumn(i) }}
                          </v-chip>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, ri) in sampleData.slice(0, 5)" :key="ri">
                        <td v-for="(cell, ci) in row" :key="ci" class="text-caption">
                          {{ cell }}
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </div>
              </template>
            </v-card>
          </template>

          <!-- Step 3: Preview -->
          <template #item.3>
            <v-card flat class="pa-4">
              <div v-if="loadingPreview" class="text-center py-8">
                <v-progress-circular indeterminate size="48" />
                <p class="mt-4">Validating data...</p>
              </div>

              <template v-else-if="previewResult">
                <!-- Summary -->
                <v-row dense class="mb-4">
                  <v-col cols="6" sm="3">
                    <v-card color="grey-darken-3" class="pa-3 text-center">
                      <div class="text-h5">{{ previewResult.totalRows }}</div>
                      <div class="text-caption">Total Rows</div>
                    </v-card>
                  </v-col>
                  <v-col cols="6" sm="3">
                    <v-card color="success" class="pa-3 text-center">
                      <div class="text-h5">{{ previewResult.validRows }}</div>
                      <div class="text-caption">Valid</div>
                    </v-card>
                  </v-col>
                  <v-col cols="6" sm="3">
                    <v-card color="warning" class="pa-3 text-center">
                      <div class="text-h5">{{ previewResult.parseErrors.length }}</div>
                      <div class="text-caption">Parse Errors</div>
                    </v-card>
                  </v-col>
                  <v-col cols="6" sm="3">
                    <v-card color="error" class="pa-3 text-center">
                      <div class="text-h5">{{ previewResult.validationErrors.length }}</div>
                      <div class="text-caption">Validation Errors</div>
                    </v-card>
                  </v-col>
                </v-row>

                <!-- Errors -->
                <div
                  v-if="previewResult.parseErrors.length || previewResult.validationErrors.length"
                  class="mb-4"
                >
                  <v-expansion-panels variant="accordion">
                    <v-expansion-panel v-if="previewResult.parseErrors.length" title="Parse Errors">
                      <v-expansion-panel-text>
                        <v-table density="compact">
                          <thead>
                            <tr>
                              <th>Row</th>
                              <th>Field</th>
                              <th>Value</th>
                              <th>Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr v-for="(err, i) in previewResult.parseErrors.slice(0, 20)" :key="i">
                              <td>{{ err.rowNumber }}</td>
                              <td>{{ err.field }}</td>
                              <td class="text-truncate" style="max-width: 150px">
                                {{ err.value }}
                              </td>
                              <td class="text-error">{{ err.message }}</td>
                            </tr>
                          </tbody>
                        </v-table>
                        <p
                          v-if="previewResult.parseErrors.length > 20"
                          class="text-caption text-medium-emphasis mt-2"
                        >
                          Showing first 20 of {{ previewResult.parseErrors.length }} errors
                        </p>
                      </v-expansion-panel-text>
                    </v-expansion-panel>

                    <v-expansion-panel
                      v-if="previewResult.validationErrors.length"
                      title="Validation Errors"
                    >
                      <v-expansion-panel-text>
                        <v-table density="compact">
                          <thead>
                            <tr>
                              <th>Row</th>
                              <th>Field</th>
                              <th>Value</th>
                              <th>Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr
                              v-for="(err, i) in previewResult.validationErrors.slice(0, 20)"
                              :key="i"
                            >
                              <td>{{ err.rowNumber }}</td>
                              <td>{{ err.field }}</td>
                              <td class="text-truncate" style="max-width: 150px">
                                {{ err.value }}
                              </td>
                              <td class="text-error">{{ err.message }}</td>
                            </tr>
                          </tbody>
                        </v-table>
                        <p
                          v-if="previewResult.validationErrors.length > 20"
                          class="text-caption text-medium-emphasis mt-2"
                        >
                          Showing first 20 of {{ previewResult.validationErrors.length }} errors
                        </p>
                      </v-expansion-panel-text>
                    </v-expansion-panel>
                  </v-expansion-panels>
                </div>

                <!-- Sample Valid Rows -->
                <div v-if="previewResult.sampleRows.length">
                  <p class="text-subtitle-2 mb-2">Sample Valid Rows</p>
                  <v-table density="compact">
                    <thead>
                      <tr>
                        <th>Ticker</th>
                        <th>Location</th>
                        <th>Price</th>
                        <th>Currency</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in previewResult.sampleRows.slice(0, 10)" :key="row.rowNumber">
                        <td>{{ row.ticker }}</td>
                        <td>{{ row.location }}</td>
                        <td class="text-right">{{ row.price.toFixed(2) }}</td>
                        <td>{{ row.currency }}</td>
                      </tr>
                    </tbody>
                  </v-table>
                </div>
              </template>
            </v-card>
          </template>

          <!-- Step 4: Import -->
          <template #item.4>
            <v-card flat class="pa-4">
              <div v-if="importing" class="text-center py-8">
                <v-progress-circular indeterminate size="48" />
                <p class="mt-4">Importing prices...</p>
              </div>

              <template v-else-if="importResult">
                <v-alert
                  v-if="importResult.imported + importResult.updated > 0"
                  type="success"
                  class="mb-4"
                >
                  Successfully imported {{ importResult.imported }} new prices and updated
                  {{ importResult.updated }} existing prices.
                </v-alert>

                <v-alert v-if="importResult.skipped > 0" type="warning" class="mb-4">
                  {{ importResult.skipped }} rows were skipped due to errors.
                </v-alert>

                <div v-if="importResult.errors.length" class="mt-4">
                  <p class="text-subtitle-2 mb-2">Import Errors</p>
                  <v-table density="compact">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Field</th>
                        <th>Value</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(err, i) in importResult.errors.slice(0, 20)" :key="i">
                        <td>{{ err.rowNumber }}</td>
                        <td>{{ err.field }}</td>
                        <td class="text-truncate" style="max-width: 150px">{{ err.value }}</td>
                        <td class="text-error">{{ err.message }}</td>
                      </tr>
                    </tbody>
                  </v-table>
                </div>
              </template>

              <div v-else class="text-center py-8">
                <v-icon size="64" color="primary" class="mb-4">mdi-check-circle</v-icon>
                <p class="text-h6 mb-2">Ready to Import</p>
                <p class="text-body-2 text-medium-emphasis">
                  {{ previewResult?.validRows ?? 0 }} prices will be imported to {{ exchangeCode }}
                </p>
              </div>
            </v-card>
          </template>
        </v-stepper>

        <!-- Error message -->
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
        <v-btn v-if="step > 1 && !importResult" variant="text" @click="prevStep">
          <v-icon start>mdi-chevron-left</v-icon>
          Back
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="close">
          {{ importResult ? 'Close' : 'Cancel' }}
        </v-btn>
        <v-btn
          v-if="step < 4 && !importResult"
          color="primary"
          :disabled="!canProceed"
          :loading="loadingSheet || loadingPreview"
          @click="nextStep"
        >
          {{ step === 3 ? 'Import' : 'Next' }}
          <v-icon end>mdi-chevron-right</v-icon>
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Currency } from '@kawakawa/types'
import {
  api,
  type CsvFieldMapping,
  type CsvPreviewResult,
  type CsvImportResult,
  type GoogleSheetsImportRequest,
} from '../services/api'
import { locationService } from '../services/locationService'
import { useUserStore } from '../stores/user'
import { useDialogBehavior } from '../composables'
import KeyValueAutocomplete, { type KeyValueItem } from './KeyValueAutocomplete.vue'

const props = defineProps<{
  modelValue: boolean
  exchangeCode: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'imported', result: CsvImportResult): void
}>()

const userStore = useUserStore()

const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const dialogBehavior = useDialogBehavior({ modelValue: dialog })

// Stepper
const step = ref(1)
const steps = ['Enter URL', 'Map Columns', 'Preview', 'Import']

// URL entry
const sheetsUrl = ref('')
const urlError = ref('')
const loadingSheet = ref(false)

// Detected data from sheet
const detectedHeaders = ref<string[]>([])
const sampleData = ref<string[][]>([])

// Mapping configuration
const mapping = ref<CsvFieldMapping>({
  ticker: 0,
  price: 1,
  location: undefined,
  currency: undefined,
})
const locationDefault = ref<string | null>(null)
const currencyDefault = ref<Currency | null>(userStore.getPreferredCurrency())

// Preview & Import
const loadingPreview = ref(false)
const previewResult = ref<CsvPreviewResult | null>(null)
const importing = ref(false)
const importResult = ref<CsvImportResult | null>(null)
const errorMessage = ref('')

// Constants
const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

// Location options from service
const locationOptions = computed((): KeyValueItem[] => {
  return locationService.getAllLocationsSync().map(loc => ({
    key: loc.id,
    display: locationService.getLocationDisplay(loc.id, userStore.getLocationDisplayMode()),
    locationType: loc.type,
    isUserLocation: locationService.isUserLocation(loc.id),
    storageTypes: locationService.getStorageTypes(loc.id),
  }))
})

// Column options for mapping
const columnOptions = computed(() => {
  return detectedHeaders.value.map((h, i) => ({
    title: h || `Column ${i + 1}`,
    value: i,
  }))
})

const optionalColumnOptions = computed(() => {
  return [{ title: '(None)', value: null }, ...columnOptions.value]
})

// Validate Google Sheets URL
const isValidSheetsUrl = (url: string): boolean => {
  if (!url) return false
  return /docs\.google\.com\/spreadsheets\/d\/[\w-]+/.test(url)
}

// Can proceed to next step
const canProceed = computed(() => {
  if (step.value === 1) {
    return !!sheetsUrl.value && isValidSheetsUrl(sheetsUrl.value)
  }
  if (step.value === 2) {
    const hasRequiredMappings = mapping.value.ticker !== null && mapping.value.price !== null
    const hasLocationConfig = mapping.value.location !== undefined || locationDefault.value
    const hasCurrencyConfig = mapping.value.currency !== undefined || currencyDefault.value
    return hasRequiredMappings && hasLocationConfig && hasCurrencyConfig
  }
  if (step.value === 3) {
    return previewResult.value && previewResult.value.validRows > 0
  }
  return false
})

// Get which mapping a column is assigned to
const getMappingForColumn = (index: number): string | null => {
  if (mapping.value.ticker === index) return 'Ticker'
  if (mapping.value.price === index) return 'Price'
  if (mapping.value.location === index) return 'Location'
  if (mapping.value.currency === index) return 'Currency'
  return null
}

// Auto-detect column mappings based on headers
const autoDetectMappings = () => {
  const headerLower = detectedHeaders.value.map(h => h.toLowerCase())

  // Ticker
  const tickerIdx = headerLower.findIndex(h =>
    ['ticker', 'symbol', 'commodity', 'material', 'mat'].includes(h)
  )
  if (tickerIdx >= 0) mapping.value.ticker = tickerIdx

  // Price
  const priceIdx = headerLower.findIndex(h =>
    ['price', 'cost', 'value', 'amount', 'rate'].includes(h)
  )
  if (priceIdx >= 0) mapping.value.price = priceIdx
  else if (tickerIdx === 0 && detectedHeaders.value.length > 1) {
    mapping.value.price = 1
  }

  // Location
  const locationIdx = headerLower.findIndex(h =>
    ['location', 'loc', 'station', 'planet', 'place'].includes(h)
  )
  if (locationIdx >= 0) mapping.value.location = locationIdx

  // Currency
  const currencyIdx = headerLower.findIndex(h => ['currency', 'curr', 'cur', 'ccy'].includes(h))
  if (currencyIdx >= 0) mapping.value.currency = currencyIdx
}

// Build the import request
const buildImportRequest = (): GoogleSheetsImportRequest => {
  return {
    exchangeCode: props.exchangeCode,
    url: sheetsUrl.value,
    fieldMapping: {
      ticker: mapping.value.ticker,
      price: mapping.value.price,
      location: mapping.value.location ?? undefined,
      currency: mapping.value.currency ?? undefined,
    },
    locationDefault: locationDefault.value ?? undefined,
    currencyDefault: currencyDefault.value ?? undefined,
  }
}

// Navigation
const prevStep = () => {
  if (step.value > 1) {
    step.value--
    if (step.value < 3) {
      previewResult.value = null
    }
  }
}

const nextStep = async () => {
  errorMessage.value = ''
  urlError.value = ''

  if (step.value === 1) {
    // Fetch sheet data to get headers for mapping
    await fetchSheetData()
    if (detectedHeaders.value.length > 0) {
      step.value = 2
    }
  } else if (step.value === 2) {
    // Load preview with validation
    await loadPreview()
    if (previewResult.value) {
      step.value = 3
    }
  } else if (step.value === 3) {
    // Execute import
    await executeImport()
    if (importResult.value) {
      step.value = 4
    }
  } else {
    step.value++
  }
}

// Fetch sheet data for column mapping
const fetchSheetData = async () => {
  try {
    loadingSheet.value = true
    errorMessage.value = ''

    const request = buildImportRequest()
    const result = await api.priceImport.previewGoogleSheets(request)

    if (result.sampleRows.length > 0 || result.parseErrors.length > 0) {
      // Extract headers from the result
      detectedHeaders.value =
        result.headers.length > 0
          ? result.headers
          : ['Column 1', 'Column 2', 'Column 3', 'Column 4']

      // Build sample data from the parsed rows
      sampleData.value = result.sampleRows
        .slice(0, 5)
        .map(row => [row.ticker, row.location || '', row.price.toString(), row.currency || ''])

      autoDetectMappings()
    } else {
      errorMessage.value =
        'No data found in the spreadsheet. Make sure the sheet is published and accessible.'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to fetch spreadsheet data'
  } finally {
    loadingSheet.value = false
  }
}

// Load preview with full validation
const loadPreview = async () => {
  try {
    loadingPreview.value = true
    errorMessage.value = ''

    const request = buildImportRequest()
    previewResult.value = await api.priceImport.previewGoogleSheets(request)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to preview data'
  } finally {
    loadingPreview.value = false
  }
}

// Execute the import
const executeImport = async () => {
  try {
    importing.value = true
    errorMessage.value = ''

    const request = buildImportRequest()
    importResult.value = await api.priceImport.importGoogleSheets(request)
    emit('imported', importResult.value)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to import data'
  } finally {
    importing.value = false
  }
}

const close = () => {
  dialog.value = false
}

// Reset when dialog closes
watch(dialog, open => {
  if (!open) {
    step.value = 1
    sheetsUrl.value = ''
    urlError.value = ''
    detectedHeaders.value = []
    sampleData.value = []
    mapping.value = { ticker: 0, price: 1, location: undefined, currency: undefined }
    locationDefault.value = null
    currencyDefault.value = userStore.getPreferredCurrency()
    previewResult.value = null
    importResult.value = null
    errorMessage.value = ''
  }
})
</script>

<style scoped>
.sample-table {
  font-size: 0.75rem;
}

.sample-table th,
.sample-table td {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 150px;
}
</style>
