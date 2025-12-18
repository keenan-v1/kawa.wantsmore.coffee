<template>
  <v-dialog
    v-model="dialog"
    max-width="500"
    :persistent="dialogBehavior.persistent.value"
    :no-click-animation="dialogBehavior.noClickAnimation"
  >
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon start>{{ isEdit ? 'mdi-pencil' : 'mdi-plus' }}</v-icon>
        {{ isEdit ? 'Edit Price List' : 'Create Price List' }}
        <v-spacer />
        <v-btn icon size="small" variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <v-form ref="formRef" @submit.prevent="save">
          <v-text-field
            v-model="form.code"
            label="Code *"
            :disabled="isEdit"
            :rules="[
              v => !!v || 'Code is required',
              v => /^[A-Z0-9_-]+$/i.test(v) || 'Invalid code format',
            ]"
            hint="Unique identifier (e.g., 'KAWA', 'CUSTOM1')"
            persistent-hint
            class="mb-4"
          />

          <v-text-field
            v-model="form.name"
            label="Name *"
            :rules="[v => !!v || 'Name is required']"
            hint="Display name for the price list"
            persistent-hint
            class="mb-4"
          />

          <v-textarea
            v-model="form.description"
            label="Description"
            rows="2"
            hint="Optional description"
            persistent-hint
            class="mb-4"
          />

          <v-select
            v-model="form.type"
            :items="typeOptions"
            label="Type *"
            :disabled="isEdit"
            :rules="[v => !!v || 'Type is required']"
            hint="FIO lists sync from game exchanges, custom lists are manually managed"
            persistent-hint
            class="mb-4"
          />

          <v-select
            v-model="form.currency"
            :items="currencyOptions"
            label="Currency *"
            :disabled="isEdit && props.priceList?.type === 'fio'"
            :rules="[v => !!v || 'Currency is required']"
            class="mb-4"
          />

          <v-autocomplete
            v-model="form.defaultLocationId"
            :items="locationOptions"
            item-title="display"
            item-value="key"
            label="Default Location"
            clearable
            hint="Optional default location for prices"
            persistent-hint
            class="mb-4"
          />

          <v-switch
            v-model="form.isActive"
            label="Active"
            color="success"
            hint="Inactive price lists are hidden from users"
            persistent-hint
          />
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
import { ref, computed, watch } from 'vue'
import type { Currency } from '@kawakawa/types'
import { api, type PriceListDefinition, type PriceListType } from '../services/api'
import { locationService } from '../services/locationService'
import { useUserStore } from '../stores/user'
import { useDialogBehavior } from '../composables'

const props = defineProps<{
  modelValue: boolean
  priceList?: PriceListDefinition | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved', priceList: PriceListDefinition): void
}>()

const userStore = useUserStore()

const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const dialogBehavior = useDialogBehavior({ modelValue: dialog })

const isEdit = computed(() => !!props.priceList)

const formRef = ref()
const form = ref({
  code: '',
  name: '',
  description: '' as string | null,
  type: 'custom' as PriceListType,
  currency: 'CIS' as Currency,
  defaultLocationId: null as string | null,
  isActive: true,
})
const saving = ref(false)
const errorMessage = ref('')

const typeOptions = [
  { title: 'Custom (manually managed)', value: 'custom' },
  { title: 'FIO (synced from game exchange)', value: 'fio' },
]

const currencyOptions: Currency[] = ['CIS', 'NCC', 'ICA', 'AIC']

const locationOptions = computed(() => {
  return locationService.getAllLocationsSync().map(loc => ({
    key: loc.id,
    display: locationService.getLocationDisplay(loc.id, userStore.getLocationDisplayMode()),
    locationType: loc.type,
    isUserLocation: locationService.isUserLocation(loc.id),
    storageTypes: locationService.getStorageTypes(loc.id),
  }))
})

const save = async () => {
  const { valid } = await formRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    errorMessage.value = ''

    let result: PriceListDefinition

    if (isEdit.value && props.priceList) {
      result = await api.priceLists.update(props.priceList.code, {
        name: form.value.name,
        description: form.value.description,
        currency: form.value.currency,
        defaultLocationId: form.value.defaultLocationId,
        isActive: form.value.isActive,
      })
    } else {
      result = await api.priceLists.create({
        code: form.value.code.toUpperCase(),
        name: form.value.name,
        description: form.value.description,
        type: form.value.type,
        currency: form.value.currency,
        defaultLocationId: form.value.defaultLocationId,
        isActive: form.value.isActive,
      })
    }

    emit('saved', result)
    close()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'Failed to save price list'
  } finally {
    saving.value = false
  }
}

const close = () => {
  dialog.value = false
}

// Reset form when dialog opens/closes
watch(dialog, open => {
  if (open && props.priceList) {
    // Edit mode - populate form
    form.value = {
      code: props.priceList.code,
      name: props.priceList.name,
      description: props.priceList.description,
      type: props.priceList.type,
      currency: props.priceList.currency,
      defaultLocationId: props.priceList.defaultLocationId,
      isActive: props.priceList.isActive,
    }
  } else if (open) {
    // Create mode - reset form
    form.value = {
      code: '',
      name: '',
      description: null,
      type: 'custom',
      currency: 'CIS',
      defaultLocationId: null,
      isActive: true,
    }
  }
  errorMessage.value = ''
})
</script>
