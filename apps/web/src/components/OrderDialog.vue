<template>
  <v-dialog
    v-model="dialog"
    max-width="1000"
    width="95%"
    :persistent="dialogBehavior.persistent.value"
    :no-click-animation="dialogBehavior.noClickAnimation"
  >
    <v-card>
      <v-card-title class="pb-0">
        <v-tabs v-model="activeTab" color="primary" grow>
          <v-tab value="buy" :disabled="!canShowBuyTab">
            <v-icon start>mdi-cart-plus</v-icon>
            Buy Order
          </v-tab>
          <v-tab value="sell" :disabled="!canShowSellTab">
            <v-icon start>mdi-tag</v-icon>
            Sell Order
          </v-tab>
        </v-tabs>
      </v-card-title>

      <v-card-text class="pt-4">
        <!-- Error Alert -->
        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          class="mb-4"
          closable
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>

        <v-row>
          <!-- Left Column: Order Form -->
          <v-col cols="12" md="6">
            <v-tabs-window v-model="activeTab">
              <!-- Buy Order Tab -->
              <v-tabs-window-item value="buy">
                <v-form ref="buyFormRef" @submit.prevent="submitOrder">
                  <!-- Commodity -->
                  <KeyValueAutocomplete
                    ref="buyCommodityRef"
                    v-model="buyForm.commodityTicker"
                    :items="commodities"
                    :favorites="settingsStore.favoritedCommodities.value"
                    :show-icons="hasIcons"
                    label="Commodity"
                    :rules="[v => !!v || 'Commodity is required']"
                    :loading="loadingCommodities"
                    required
                    @update:favorites="
                      settingsStore.updateSetting('market.favoritedCommodities', $event)
                    "
                  />

                  <!-- Location -->
                  <KeyValueAutocomplete
                    v-model="buyForm.locationId"
                    :items="locations"
                    :favorites="settingsStore.favoritedLocations.value"
                    label="Location"
                    :rules="[v => !!v || 'Location is required']"
                    :loading="loadingLocations"
                    required
                    @update:favorites="
                      settingsStore.updateSetting('market.favoritedLocations', $event)
                    "
                  />

                  <!-- Quantity -->
                  <v-text-field
                    v-model.number="buyForm.quantity"
                    label="Quantity"
                    type="number"
                    min="1"
                    :rules="[v => v > 0 || 'Quantity must be positive']"
                    required
                  />

                  <!-- Automatic Pricing Status & Visibility -->
                  <div class="d-flex align-center mb-3 text-body-2">
                    <span class="text-medium-emphasis">Automatic Pricing:</span>
                    <a
                      v-if="buyForm.usePriceList"
                      href="#"
                      tabindex="-1"
                      class="ml-2 font-weight-medium text-primary"
                      @click.prevent="toggleAutomaticPricing(false)"
                    >
                      ON
                    </a>
                    <a
                      v-else-if="canUseDynamicPricing"
                      href="#"
                      tabindex="-1"
                      class="ml-2 font-weight-medium text-primary"
                      @click.prevent="toggleAutomaticPricing(true)"
                    >
                      OFF
                    </a>
                    <span v-else class="ml-2 text-medium-emphasis">
                      OFF
                      <v-tooltip location="top">
                        <template #activator="{ props: tooltipProps }">
                          <v-icon v-bind="tooltipProps" size="small" color="warning" class="ml-1">
                            mdi-alert-circle-outline
                          </v-icon>
                        </template>
                        <span>Set a default price list in Account Settings to enable</span>
                      </v-tooltip>
                    </span>
                    <v-chip
                      v-if="buyForm.usePriceList"
                      size="x-small"
                      color="info"
                      variant="tonal"
                      class="ml-2"
                    >
                      {{ settingsStore.defaultPriceList.value }}
                    </v-chip>

                    <v-spacer />

                    <!-- Visibility selector -->
                    <v-menu v-if="orderTypes.length > 1" location="bottom end">
                      <template #activator="{ props: menuProps }">
                        <v-chip
                          v-bind="menuProps"
                          size="small"
                          variant="tonal"
                          :color="buyForm.orderType === 'partner' ? 'primary' : 'default'"
                          class="cursor-pointer"
                        >
                          <v-icon start size="small">
                            {{ buyForm.orderType === 'partner' ? 'mdi-account-group' : 'mdi-home' }}
                          </v-icon>
                          {{ buyForm.orderType === 'partner' ? 'Partner' : 'Internal' }}
                          <v-icon end size="small">mdi-menu-down</v-icon>
                        </v-chip>
                      </template>
                      <v-list density="compact">
                        <v-list-item
                          v-for="type in orderTypes"
                          :key="type.value"
                          :active="buyForm.orderType === type.value"
                          @click="buyForm.orderType = type.value"
                        >
                          <template #prepend>
                            <v-icon size="small">
                              {{ type.value === 'partner' ? 'mdi-account-group' : 'mdi-home' }}
                            </v-icon>
                          </template>
                          <v-list-item-title>{{ type.title }}</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                    <v-chip
                      v-else
                      size="small"
                      variant="tonal"
                      :color="buyForm.orderType === 'partner' ? 'primary' : 'default'"
                    >
                      <v-icon start size="small">
                        {{ buyForm.orderType === 'partner' ? 'mdi-account-group' : 'mdi-home' }}
                      </v-icon>
                      {{ buyForm.orderType === 'partner' ? 'Partner' : 'Internal' }}
                    </v-chip>
                  </div>

                  <!-- Dynamic Pricing Display (when using price list) -->
                  <PriceListDisplay
                    v-if="buyForm.usePriceList"
                    :loading="loadingSuggestedPrice"
                    :price="suggestedPrice"
                    :price-list-code="settingsStore.defaultPriceList.value ?? ''"
                    :requested-currency="buyForm.currency"
                    :fallback-location-display="
                      suggestedPrice?.locationId
                        ? getLocationDisplay(suggestedPrice.locationId)
                        : ''
                    "
                    :requested-location-display="
                      suggestedPrice?.requestedLocationId
                        ? getLocationDisplay(suggestedPrice.requestedLocationId)
                        : ''
                    "
                    class="mb-3"
                  />

                  <!-- Custom Price (when not using price list) -->
                  <template v-else>
                    <v-row>
                      <v-col cols="8">
                        <v-text-field
                          v-model.number="buyForm.price"
                          label="Unit Price"
                          type="number"
                          min="0"
                          step="0.01"
                          :rules="[
                            v =>
                              remainingBuyOrderQuantity <= 0 || v > 0 || 'Price must be positive',
                          ]"
                          :required="remainingBuyOrderQuantity > 0"
                          :hint="
                            remainingBuyOrderQuantity <= 0
                              ? 'Not required - no order will be placed'
                              : ''
                          "
                          :persistent-hint="remainingBuyOrderQuantity <= 0"
                        />
                      </v-col>
                      <v-col cols="4">
                        <v-select v-model="buyForm.currency" :items="currencies" label="Currency" />
                      </v-col>
                    </v-row>

                    <!-- Price Suggestion (only when not using price list) -->
                    <div
                      v-if="suggestedPrice || loadingSuggestedPrice"
                      class="price-suggestion mb-3"
                    >
                      <div class="d-flex align-center text-caption">
                        <v-progress-circular
                          v-if="loadingSuggestedPrice"
                          indeterminate
                          size="14"
                          width="2"
                          class="mr-2"
                        />
                        <v-icon v-else size="small" class="mr-1" color="info">mdi-lightbulb</v-icon>
                        <template v-if="suggestedPrice">
                          <span class="text-medium-emphasis">Suggested price:</span>
                          <span class="font-weight-medium ml-1">
                            {{ suggestedPrice.finalPrice.toFixed(2) }} {{ suggestedPrice.currency }}
                          </span>
                          <!-- Currency mismatch indicator -->
                          <v-tooltip
                            v-if="suggestedPrice.currency !== buyForm.currency"
                            location="top"
                          >
                            <template #activator="{ props: tooltipProps }">
                              <v-icon
                                v-bind="tooltipProps"
                                size="small"
                                color="warning"
                                class="ml-1"
                              >
                                mdi-swap-horizontal
                              </v-icon>
                            </template>
                            <span
                              >Price is in {{ suggestedPrice.currency }} (will update currency when
                              used)</span
                            >
                          </v-tooltip>
                          <!-- Fallback location indicator -->
                          <v-tooltip v-if="suggestedPrice.isFallback" location="top">
                            <template #activator="{ props: tooltipProps }">
                              <v-icon
                                v-bind="tooltipProps"
                                size="small"
                                color="warning"
                                class="ml-1"
                              >
                                mdi-map-marker-question
                              </v-icon>
                            </template>
                            <span
                              >No price at
                              {{ getLocationDisplay(suggestedPrice.requestedLocationId || '') }},
                              using default location
                              {{ getLocationDisplay(suggestedPrice.locationId) }}</span
                            >
                          </v-tooltip>
                          <v-btn
                            variant="text"
                            size="x-small"
                            color="primary"
                            class="ml-2"
                            @click="useSuggestedPrice"
                          >
                            Use
                          </v-btn>
                        </template>
                        <span v-else-if="loadingSuggestedPrice" class="text-medium-emphasis">
                          Loading suggested price...
                        </span>
                      </div>
                    </div>
                  </template>

                  <!-- Total Value for Buy Order -->
                  <v-alert
                    v-if="buyOrderTotalValue !== null"
                    color="warning"
                    variant="tonal"
                    density="compact"
                    class="mt-4"
                  >
                    <div class="d-flex justify-space-between align-center">
                      <span class="text-body-1">Total Value</span>
                      <span class="text-h6 font-weight-bold">
                        {{
                          buyOrderTotalValue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        }}
                        {{ buyForm.usePriceList ? suggestedPrice?.currency : buyForm.currency }}
                      </span>
                    </div>
                  </v-alert>
                </v-form>
              </v-tabs-window-item>

              <!-- Sell Order Tab -->
              <v-tabs-window-item value="sell">
                <v-form ref="sellFormRef" @submit.prevent="submitOrder">
                  <!-- Item Info (when inventoryItem provided) -->
                  <v-alert
                    v-if="inventoryItem"
                    type="info"
                    variant="tonal"
                    class="mb-4"
                    density="compact"
                  >
                    <div>
                      <strong>{{ getCommodityDisplay(inventoryItem.commodityTicker) }}</strong>
                    </div>
                    <div class="text-caption">
                      {{ getLocationDisplay(inventoryItem.locationId) }}
                      &bull; {{ inventoryItem.quantity?.toLocaleString() }} available
                    </div>
                  </v-alert>

                  <!-- Commodity/Location (when no inventoryItem) -->
                  <template v-if="!inventoryItem">
                    <KeyValueAutocomplete
                      ref="sellCommodityRef"
                      v-model="sellForm.commodityTicker"
                      :items="commodities"
                      :favorites="settingsStore.favoritedCommodities.value"
                      :show-icons="hasIcons"
                      label="Commodity"
                      :rules="[v => !!v || 'Commodity is required']"
                      :loading="loadingCommodities"
                      required
                      @update:favorites="
                        settingsStore.updateSetting('market.favoritedCommodities', $event)
                      "
                    />

                    <KeyValueAutocomplete
                      v-model="sellForm.locationId"
                      :items="locations"
                      :favorites="settingsStore.favoritedLocations.value"
                      label="Location"
                      :rules="[v => !!v || 'Location is required']"
                      :loading="loadingLocations"
                      required
                      @update:favorites="
                        settingsStore.updateSetting('market.favoritedLocations', $event)
                      "
                    />
                  </template>

                  <!-- Existing order alert -->
                  <v-alert
                    v-if="existingSellOrder"
                    type="warning"
                    variant="tonal"
                    class="mb-4"
                    density="compact"
                  >
                    <div class="font-weight-medium">Order already exists</div>
                    <div class="text-caption">
                      You have a sell order for this commodity at this location in
                      {{ existingSellOrder.currency }}. Use the Edit button to modify it.
                    </div>
                  </v-alert>

                  <!-- Automatic Pricing Status & Visibility -->
                  <div class="d-flex align-center mb-3 text-body-2">
                    <span class="text-medium-emphasis">Automatic Pricing:</span>
                    <a
                      v-if="sellForm.usePriceList"
                      href="#"
                      tabindex="-1"
                      class="ml-2 font-weight-medium text-primary"
                      @click.prevent="toggleAutomaticPricing(false)"
                    >
                      ON
                    </a>
                    <a
                      v-else-if="canUseDynamicPricing"
                      href="#"
                      tabindex="-1"
                      class="ml-2 font-weight-medium text-primary"
                      @click.prevent="toggleAutomaticPricing(true)"
                    >
                      OFF
                    </a>
                    <span v-else class="ml-2 text-medium-emphasis">
                      OFF
                      <v-tooltip location="top">
                        <template #activator="{ props: tooltipProps }">
                          <v-icon v-bind="tooltipProps" size="small" color="warning" class="ml-1">
                            mdi-alert-circle-outline
                          </v-icon>
                        </template>
                        <span>Set a default price list in Account Settings to enable</span>
                      </v-tooltip>
                    </span>
                    <v-chip
                      v-if="sellForm.usePriceList"
                      size="x-small"
                      color="info"
                      variant="tonal"
                      class="ml-2"
                    >
                      {{ settingsStore.defaultPriceList.value }}
                    </v-chip>

                    <v-spacer />

                    <!-- Visibility selector -->
                    <v-menu v-if="orderTypes.length > 1" location="bottom end">
                      <template #activator="{ props: menuProps }">
                        <v-chip
                          v-bind="menuProps"
                          size="small"
                          variant="tonal"
                          :color="sellForm.orderType === 'partner' ? 'primary' : 'default'"
                          class="cursor-pointer"
                        >
                          <v-icon start size="small">
                            {{
                              sellForm.orderType === 'partner' ? 'mdi-account-group' : 'mdi-home'
                            }}
                          </v-icon>
                          {{ sellForm.orderType === 'partner' ? 'Partner' : 'Internal' }}
                          <v-icon end size="small">mdi-menu-down</v-icon>
                        </v-chip>
                      </template>
                      <v-list density="compact">
                        <v-list-item
                          v-for="type in orderTypes"
                          :key="type.value"
                          :active="sellForm.orderType === type.value"
                          @click="sellForm.orderType = type.value"
                        >
                          <template #prepend>
                            <v-icon size="small">
                              {{ type.value === 'partner' ? 'mdi-account-group' : 'mdi-home' }}
                            </v-icon>
                          </template>
                          <v-list-item-title>{{ type.title }}</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                    <v-chip
                      v-else
                      size="small"
                      variant="tonal"
                      :color="sellForm.orderType === 'partner' ? 'primary' : 'default'"
                    >
                      <v-icon start size="small">
                        {{ sellForm.orderType === 'partner' ? 'mdi-account-group' : 'mdi-home' }}
                      </v-icon>
                      {{ sellForm.orderType === 'partner' ? 'Partner' : 'Internal' }}
                    </v-chip>
                  </div>

                  <!-- Dynamic Pricing Display (when using price list) -->
                  <PriceListDisplay
                    v-if="sellForm.usePriceList"
                    :loading="loadingSuggestedPrice"
                    :price="suggestedPrice"
                    :price-list-code="settingsStore.defaultPriceList.value ?? ''"
                    :requested-currency="sellForm.currency"
                    :fallback-location-display="
                      suggestedPrice?.locationId
                        ? getLocationDisplay(suggestedPrice.locationId)
                        : ''
                    "
                    :requested-location-display="
                      suggestedPrice?.requestedLocationId
                        ? getLocationDisplay(suggestedPrice.requestedLocationId)
                        : ''
                    "
                    class="mb-3"
                  />

                  <!-- Custom Price (when not using price list) -->
                  <template v-else>
                    <v-row>
                      <v-col cols="8">
                        <v-text-field
                          v-model.number="sellForm.price"
                          label="Unit Price"
                          type="number"
                          min="0"
                          step="0.01"
                          :rules="[v => v > 0 || 'Price must be positive']"
                          required
                        />
                      </v-col>
                      <v-col cols="4">
                        <v-select
                          v-model="sellForm.currency"
                          :items="currencies"
                          label="Currency"
                        />
                      </v-col>
                    </v-row>

                    <!-- Price Suggestion (only when not using price list) -->
                    <div
                      v-if="suggestedPrice || loadingSuggestedPrice"
                      class="price-suggestion mb-3"
                    >
                      <div class="d-flex align-center text-caption">
                        <v-progress-circular
                          v-if="loadingSuggestedPrice"
                          indeterminate
                          size="14"
                          width="2"
                          class="mr-2"
                        />
                        <v-icon v-else size="small" class="mr-1" color="info">mdi-lightbulb</v-icon>
                        <template v-if="suggestedPrice">
                          <span class="text-medium-emphasis">Suggested price:</span>
                          <span class="font-weight-medium ml-1">
                            {{ suggestedPrice.finalPrice.toFixed(2) }} {{ suggestedPrice.currency }}
                          </span>
                          <!-- Currency mismatch indicator -->
                          <v-tooltip
                            v-if="suggestedPrice.currency !== sellForm.currency"
                            location="top"
                          >
                            <template #activator="{ props: tooltipProps }">
                              <v-icon
                                v-bind="tooltipProps"
                                size="small"
                                color="warning"
                                class="ml-1"
                              >
                                mdi-swap-horizontal
                              </v-icon>
                            </template>
                            <span
                              >Price is in {{ suggestedPrice.currency }} (will update currency when
                              used)</span
                            >
                          </v-tooltip>
                          <!-- Fallback location indicator -->
                          <v-tooltip v-if="suggestedPrice.isFallback" location="top">
                            <template #activator="{ props: tooltipProps }">
                              <v-icon
                                v-bind="tooltipProps"
                                size="small"
                                color="warning"
                                class="ml-1"
                              >
                                mdi-map-marker-question
                              </v-icon>
                            </template>
                            <span
                              >No price at
                              {{ getLocationDisplay(suggestedPrice.requestedLocationId || '') }},
                              using default location
                              {{ getLocationDisplay(suggestedPrice.locationId) }}</span
                            >
                          </v-tooltip>
                          <v-btn
                            variant="text"
                            size="x-small"
                            color="primary"
                            class="ml-2"
                            @click="useSuggestedPrice"
                          >
                            Use
                          </v-btn>
                        </template>
                        <span v-else-if="loadingSuggestedPrice" class="text-medium-emphasis">
                          Loading suggested price...
                        </span>
                      </div>
                    </div>
                  </template>

                  <!-- Limit Mode -->
                  <v-select
                    v-model="sellForm.limitMode"
                    :items="limitModes"
                    item-title="title"
                    item-value="value"
                    label="Quantity Limit"
                    hint="Control how much of your inventory is available for sale"
                    persistent-hint
                  />

                  <!-- Limit Quantity (shown when not 'none') -->
                  <v-text-field
                    v-if="sellForm.limitMode !== 'none'"
                    v-model.number="sellForm.limitQuantity"
                    :label="
                      sellForm.limitMode === 'max_sell' ? 'Maximum to sell' : 'Reserve quantity'
                    "
                    type="number"
                    min="0"
                    :rules="[v => v >= 0 || 'Quantity must be non-negative']"
                    :hint="limitQuantityHint"
                    persistent-hint
                    class="mt-2"
                  />

                  <!-- Total Value for Sell Order with max_sell limit -->
                  <v-alert
                    v-if="sellOrderTotalValue !== null"
                    color="success"
                    variant="tonal"
                    density="compact"
                    class="mt-4"
                  >
                    <div class="d-flex justify-space-between align-center">
                      <span class="text-body-1">Total Value</span>
                      <span class="text-h6 font-weight-bold">
                        {{
                          sellOrderTotalValue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        }}
                        {{ sellForm.usePriceList ? suggestedPrice?.currency : sellForm.currency }}
                      </span>
                    </div>
                  </v-alert>
                </v-form>
              </v-tabs-window-item>
            </v-tabs-window>
          </v-col>

          <!-- Right Column: Matching Orders -->
          <v-col cols="12" md="6">
            <div class="d-flex align-center mb-2">
              <v-icon start size="small">mdi-swap-horizontal</v-icon>
              <span class="text-subtitle-2">
                {{ activeTab === 'buy' ? 'Available Sell Orders' : 'Buy Requests to Fill' }}
              </span>
              <v-spacer />
              <v-chip v-if="shouldShowMatchingColumn" size="x-small" color="info" variant="tonal">
                {{ filteredMatchingOrders.length }} found
              </v-chip>
            </div>

            <v-divider class="mb-2" />

            <!-- Placeholder when commodity/location not set -->
            <div v-if="!shouldShowMatchingColumn" class="text-center py-8 text-medium-emphasis">
              <v-icon size="48" class="mb-3" color="grey">mdi-arrow-left</v-icon>
              <div class="text-body-2">Select a commodity and location</div>
              <div class="text-caption">to see matching orders</div>
            </div>

            <div v-else-if="loadingMatchingOrders" class="text-center py-4">
              <v-progress-circular indeterminate size="24" />
            </div>

            <div
              v-else-if="filteredMatchingOrders.length === 0"
              class="text-center py-4 text-medium-emphasis"
            >
              <v-icon size="32" class="mb-2">mdi-package-variant</v-icon>
              <div class="text-caption">No orders found</div>
            </div>

            <v-table v-else density="compact" class="matching-orders-table">
              <thead>
                <tr>
                  <th style="width: 28px"></th>
                  <th class="text-left">Location</th>
                  <th class="text-right">
                    <v-tooltip location="top">
                      <template #activator="{ props: tooltipProps }">
                        <span v-bind="tooltipProps" class="cursor-help">Jumps</span>
                      </template>
                      Jumps from {{ getLocationDisplay(currentLocation || '') }}
                    </v-tooltip>
                  </th>
                  <th class="text-right">
                    <v-tooltip location="top">
                      <template #activator="{ props: tooltipProps }">
                        <span v-bind="tooltipProps" class="cursor-help">Price</span>
                      </template>
                      Unit price per item
                    </v-tooltip>
                  </th>
                  <th class="text-right">Avail</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="(order, index) in filteredMatchingOrders" :key="order.id">
                  <tr
                    class="order-row"
                    :class="{ 'alt-row': index % 2 === 1 }"
                    @click="toggleOrderExpanded(order.id)"
                  >
                    <td class="pa-0">
                      <v-icon size="small" class="expand-icon">
                        {{ expandedOrders[order.id] ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
                      </v-icon>
                    </td>
                    <td>
                      <div class="text-truncate" style="min-width: 1px">
                        {{ getLocationDisplay(order.locationId) }}
                      </div>
                    </td>
                    <td class="text-right">
                      <template v-if="order.locationId === currentLocation">
                        <span class="text-success">0</span>
                      </template>
                      <template v-else-if="order.jumpCount !== null">
                        {{ order.jumpCount }}
                      </template>
                      <template v-else>
                        <span class="text-medium-emphasis">-</span>
                      </template>
                    </td>
                    <td class="text-right">
                      <span class="font-weight-medium">
                        {{ order.price.toFixed(2) }}
                      </span>
                    </td>
                    <td class="text-right">
                      {{ order.remainingQuantity.toLocaleString() }}
                    </td>
                  </tr>
                  <tr v-if="expandedOrders[order.id]" class="expanded-row">
                    <td colspan="5" class="pa-2 bg-grey-darken-4">
                      <div class="d-flex flex-column ga-2">
                        <!-- Seller/Buyer info -->
                        <div class="d-flex text-caption text-medium-emphasis">
                          <div class="mr-4">
                            <span class="text-uppercase"
                              >{{ activeTab === 'buy' ? 'Seller' : 'Buyer' }}:</span
                            >
                            <span class="text-body-2 ml-1">
                              {{ activeTab === 'buy' ? order.sellerName : order.buyerName }}
                            </span>
                          </div>
                        </div>
                        <!-- Reservation controls -->
                        <div class="d-flex align-center ga-3" @click.stop>
                          <v-label class="text-caption mr-2"
                            >{{ activeTab === 'buy' ? 'Reserve' : 'Fill' }}:</v-label
                          >
                          <v-text-field
                            v-model.number="reservationQuantities[order.id]"
                            label="Qty"
                            placeholder="0"
                            type="number"
                            density="compact"
                            hide-details
                            variant="outlined"
                            :min="0"
                            :max="order.remainingQuantity"
                            style="max-width: 120px"
                            @update:model-value="updateReservationQty(order.id, $event)"
                          />
                          <v-menu
                            v-model="expirationMenus[order.id]"
                            :close-on-content-click="false"
                            location="bottom"
                          >
                            <template #activator="{ props: menuProps }">
                              <v-chip
                                v-bind="menuProps"
                                size="small"
                                variant="outlined"
                                class="expiration-chip"
                              >
                                <v-icon start size="small">mdi-clock-outline</v-icon>
                                <DurationDisplay
                                  v-if="reservationExpirations[order.id]"
                                  :target-date="reservationExpirations[order.id]"
                                  short
                                />
                                <template v-else>3d</template>
                              </v-chip>
                            </template>
                            <v-card min-width="200">
                              <v-card-text class="pa-2">
                                <v-text-field
                                  :model-value="
                                    reservationExpirations[order.id] || getDefaultExpiration()
                                  "
                                  label="Expires"
                                  type="datetime-local"
                                  density="compact"
                                  hide-details
                                  @update:model-value="setReservationExpiration(order.id, $event)"
                                />
                              </v-card-text>
                            </v-card>
                          </v-menu>
                        </div>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </v-table>

            <!-- Reservations Summary -->
            <div
              v-if="shouldShowMatchingColumn && totalReservationQuantity > 0"
              class="mt-3 pa-2 bg-grey-darken-3 rounded"
            >
              <div class="d-flex justify-space-between align-center">
                <span class="text-caption"
                  >Total to {{ activeTab === 'buy' ? 'reserve' : 'fill' }}:</span
                >
                <span class="font-weight-bold">{{
                  totalReservationQuantity.toLocaleString()
                }}</span>
              </div>
              <div class="text-caption text-medium-emphasis">
                from {{ selectedReservationsCount }} order{{
                  selectedReservationsCount === 1 ? '' : 's'
                }}
              </div>
              <!-- Order quantity after reservations -->
              <v-divider class="my-2" />
              <div v-if="activeTab === 'buy'" class="d-flex justify-space-between align-center">
                <span class="text-caption">Order quantity:</span>
                <span class="font-weight-bold">{{
                  Math.max(0, buyForm.quantity - totalReservationQuantity).toLocaleString()
                }}</span>
              </div>
              <div
                v-else-if="sellForm.limitMode === 'max_sell'"
                class="d-flex justify-space-between align-center"
              >
                <span class="text-caption">Order max sell:</span>
                <span class="font-weight-bold">{{
                  Math.max(
                    0,
                    (sellForm.limitQuantity || 0) - totalReservationQuantity
                  ).toLocaleString()
                }}</span>
              </div>
            </div>
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions>
        <v-btn variant="text" color="secondary" @click="clearForm">Clear</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn v-if="activeTab === 'buy'" color="warning" :loading="saving" @click="submitOrder">
          {{ totalReservationQuantity > 0 ? 'Create & Reserve' : 'Create Buy Order' }}
        </v-btn>
        <template v-else>
          <!-- Show Edit button if existing order matches, Create button otherwise -->
          <v-btn
            v-if="existingSellOrder"
            color="primary"
            prepend-icon="mdi-pencil"
            @click="editExistingOrder"
          >
            Edit Existing Order
          </v-btn>
          <v-btn v-else color="success" :loading="saving" @click="submitOrder">
            {{ totalReservationQuantity > 0 ? 'Create & Fill' : 'Create Sell Order' }}
          </v-btn>
        </template>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  PERMISSIONS,
  type Currency,
  type SellOrderLimitMode,
  type OrderType,
} from '@kawakawa/types'
import {
  api,
  type FioInventoryItem,
  type MarketListing,
  type MarketBuyRequest,
  type EffectivePrice,
  type SellOrderResponse,
} from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { useDisplayHelpers, useDialogBehavior } from '../composables'
import KeyValueAutocomplete, { type KeyValueItem } from './KeyValueAutocomplete.vue'
import DurationDisplay from './DurationDisplay.vue'
import PriceListDisplay from './PriceListDisplay.vue'

type OrderTab = 'buy' | 'sell'

// Combined type for matching orders
type MatchingOrder = (MarketListing | MarketBuyRequest) & {
  sellerName?: string
  buyerName?: string
}

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    initialTab?: OrderTab
    inventoryItem?: FioInventoryItem | null
  }>(),
  {
    initialTab: 'buy',
    inventoryItem: null,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created', type: OrderTab): void
}>()

const router = useRouter()
const userStore = useUserStore()
const settingsStore = useSettingsStore()
const { getLocationDisplay, getCommodityDisplay } = useDisplayHelpers()

const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const dialogBehavior = useDialogBehavior({ modelValue: dialog })

const activeTab = ref<OrderTab>(props.initialTab)

// Form refs
const buyFormRef = ref()
const sellFormRef = ref()
const buyCommodityRef = ref<{ focus: () => void } | null>(null)
const sellCommodityRef = ref<{ focus: () => void } | null>(null)
const saving = ref(false)
const errorMessage = ref('')

// Loading states
const loadingCommodities = ref(false)
const loadingLocations = ref(false)
const loadingMatchingOrders = ref(false)
const loadingSuggestedPrice = ref(false)
const loadingExistingOrders = ref(false)

// Price suggestion
const suggestedPrice = ref<EffectivePrice | null>(null)

// User's existing sell orders (for checking duplicates)
const existingSellOrders = ref<SellOrderResponse[]>([])

// Constants
const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

const limitModes = [
  { title: 'No limit (sell all available)', value: 'none' },
  { title: 'Maximum to sell', value: 'max_sell' },
  { title: 'Reserve quantity (keep minimum)', value: 'reserve' },
]

// Tab visibility
const canShowBuyTab = computed(() => !props.inventoryItem)
const canShowSellTab = computed(() => true)

// Check permissions for order creation
const canCreateInternalOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_INTERNAL)
)
const canCreatePartnerOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_PARTNER)
)

const orderTypes = computed(() => {
  const types: { title: string; value: OrderType }[] = []
  if (canCreateInternalOrders.value) {
    types.push({ title: 'Internal (members only)', value: 'internal' })
  }
  if (canCreatePartnerOrders.value) {
    types.push({ title: 'Partner (trade partners)', value: 'partner' })
  }
  return types
})

// Default order type based on available options
const defaultOrderType = computed((): OrderType => {
  if (orderTypes.value.length === 0) return 'internal'
  return orderTypes.value[0].value
})

// Buy form
const buyForm = ref({
  commodityTicker: '',
  locationId: '',
  quantity: 1,
  price: 0,
  currency: userStore.getPreferredCurrency(),
  orderType: 'internal' as OrderType,
  usePriceList: false, // Toggle for dynamic pricing
  priceListCode: null as string | null,
})

// Sell form
const sellForm = ref({
  commodityTicker: '',
  locationId: '',
  price: 0,
  currency: userStore.getPreferredCurrency(),
  limitMode: 'none' as SellOrderLimitMode,
  limitQuantity: 0,
  orderType: 'internal' as OrderType,
  usePriceList: false, // Toggle for dynamic pricing
  priceListCode: null as string | null,
})

// Check if user can use dynamic pricing (has a default price list configured)
const canUseDynamicPricing = computed(() => {
  return !!settingsStore.defaultPriceList.value
})

// Check if commodity icons should be shown
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

// Current form's usePriceList state
const currentUsePriceList = computed(() => {
  return activeTab.value === 'buy' ? buyForm.value.usePriceList : sellForm.value.usePriceList
})

const limitQuantityHint = computed(() => {
  if (sellForm.value.limitMode === 'max_sell') {
    return `Will sell up to ${sellForm.value.limitQuantity} units`
  }
  if (sellForm.value.limitMode === 'reserve') {
    return `Will keep at least ${sellForm.value.limitQuantity} units in reserve`
  }
  return ''
})

// Commodity and location options
const commodities = ref<KeyValueItem[]>([])
const locations = ref<KeyValueItem[]>([])

// Matching orders
const matchingOrders = ref<MatchingOrder[]>([])
const reservationQuantities = ref<Record<number, number>>({})
const reservationExpirations = ref<Record<number, string>>({})
const expirationMenus = ref<Record<number, boolean>>({})
const expandedOrders = ref<Record<number, boolean>>({})

const toggleOrderExpanded = (orderId: number) => {
  expandedOrders.value[orderId] = !expandedOrders.value[orderId]
}

// Get default expiration date (3 days from now)
const getDefaultExpiration = (): string => {
  const date = new Date()
  date.setDate(date.getDate() + 3)
  return date.toISOString().slice(0, 16)
}

const setReservationExpiration = (orderId: number, value: string) => {
  reservationExpirations.value[orderId] = value
}

// Computed properties for matching orders
const currentCommodity = computed(() => {
  if (activeTab.value === 'buy') {
    return buyForm.value.commodityTicker
  }
  return props.inventoryItem?.commodityTicker ?? sellForm.value.commodityTicker
})

const currentLocation = computed(() => {
  if (activeTab.value === 'buy') {
    return buyForm.value.locationId
  }
  return props.inventoryItem?.locationId ?? sellForm.value.locationId
})

const currentCurrency = computed(() => {
  if (activeTab.value === 'buy') {
    return buyForm.value.currency
  }
  return sellForm.value.currency
})

// Filter matching orders by currency
const filteredMatchingOrders = computed(() => {
  if (!currentCurrency.value) return matchingOrders.value
  return matchingOrders.value.filter(o => o.currency === currentCurrency.value)
})

// Show the matching orders column when commodity and location are set
const shouldShowMatchingColumn = computed(() => {
  return currentCommodity.value && currentLocation.value
})

const totalReservationQuantity = computed(() => {
  return Object.values(reservationQuantities.value).reduce((sum, qty) => sum + (qty || 0), 0)
})

// Calculate the remaining order quantity after reservations
const remainingBuyOrderQuantity = computed(() => {
  return Math.max(0, buyForm.value.quantity - totalReservationQuantity.value)
})

const selectedReservationsCount = computed(() => {
  return Object.values(reservationQuantities.value).filter(qty => qty && qty > 0).length
})

// Display price - uses price list price when enabled, otherwise manual price
const displayBuyPrice = computed((): number | null => {
  if (buyForm.value.usePriceList) {
    return suggestedPrice.value?.finalPrice ?? null
  }
  return buyForm.value.price > 0 ? buyForm.value.price : null
})

const displaySellPrice = computed((): number | null => {
  if (sellForm.value.usePriceList) {
    return suggestedPrice.value?.finalPrice ?? null
  }
  return sellForm.value.price > 0 ? sellForm.value.price : null
})

// Total value for buy orders (always have fixed quantity)
const buyOrderTotalValue = computed((): number | null => {
  if (!displayBuyPrice.value || !buyForm.value.quantity) return null
  return displayBuyPrice.value * buyForm.value.quantity
})

// Total value for sell orders with max_sell limit (fixed quantity)
const sellOrderTotalValue = computed((): number | null => {
  if (sellForm.value.limitMode !== 'max_sell') return null
  if (!displaySellPrice.value || !sellForm.value.limitQuantity) return null
  return displaySellPrice.value * sellForm.value.limitQuantity
})

// Check if an existing sell order matches the current form (commodity + location + currency)
const existingSellOrder = computed(() => {
  if (activeTab.value !== 'sell') return null

  const commodity = props.inventoryItem?.commodityTicker ?? sellForm.value.commodityTicker
  const location = props.inventoryItem?.locationId ?? sellForm.value.locationId
  const currency = sellForm.value.currency

  if (!commodity || !location || !currency) return null

  return existingSellOrders.value.find(
    order =>
      order.commodityTicker === commodity &&
      order.locationId === location &&
      order.currency === currency
  )
})

// Navigate to edit existing order
const editExistingOrder = () => {
  if (!existingSellOrder.value) return
  dialog.value = false
  router.push({
    path: '/my-orders',
    query: { order: `sell:${existingSellOrder.value.id}` },
  })
}

const updateReservationQty = (orderId: number, value: number | string | null) => {
  const numValue = typeof value === 'string' ? parseInt(value, 10) : (value ?? 0)
  const order = matchingOrders.value.find(o => o.id === orderId)
  if (order) {
    // Clamp to valid range
    reservationQuantities.value[orderId] = Math.max(
      0,
      Math.min(numValue || 0, order.remainingQuantity)
    )
  }
}

// Load matching orders when commodity and location are set
const loadMatchingOrders = async () => {
  const commodity = currentCommodity.value
  const location = currentLocation.value

  if (!commodity || !location) {
    matchingOrders.value = []
    reservationQuantities.value = {}
    return
  }

  try {
    loadingMatchingOrders.value = true

    if (activeTab.value === 'buy') {
      // For buy orders, fetch sell listings (pass location as destination to get jump counts)
      const listings = await api.market.getListings(commodity, undefined, location)
      // Filter out own orders and sort by price (lowest first for buying)
      matchingOrders.value = listings
        .filter(l => !l.isOwn && l.remainingQuantity > 0)
        .sort((a, b) => {
          // Sort by distance first (nulls last), then by price
          if (a.jumpCount !== null && b.jumpCount !== null) {
            if (a.jumpCount !== b.jumpCount) return a.jumpCount - b.jumpCount
          } else if (a.jumpCount === null && b.jumpCount !== null) {
            return 1
          } else if (a.jumpCount !== null && b.jumpCount === null) {
            return -1
          }
          return a.price - b.price
        })
    } else {
      // For sell orders, fetch buy requests (pass location as destination to get jump counts)
      const requests = await api.market.getBuyRequests(commodity, undefined, location)
      // Filter out own orders and sort by price (highest first for selling)
      matchingOrders.value = requests
        .filter(r => !r.isOwn && r.remainingQuantity > 0)
        .sort((a, b) => {
          // Sort by distance first (nulls last), then by price (descending)
          if (a.jumpCount !== null && b.jumpCount !== null) {
            if (a.jumpCount !== b.jumpCount) return a.jumpCount - b.jumpCount
          } else if (a.jumpCount === null && b.jumpCount !== null) {
            return 1
          } else if (a.jumpCount !== null && b.jumpCount === null) {
            return -1
          }
          return b.price - a.price
        })
    }

    // Reset reservation quantities, expirations, and expanded state
    reservationQuantities.value = {}
    reservationExpirations.value = {}
    expirationMenus.value = {}
    expandedOrders.value = {}
  } catch (error) {
    console.error('Failed to load matching orders', error)
  } finally {
    loadingMatchingOrders.value = false
  }
}

// Load suggested price from user's default price list
const loadSuggestedPrice = async () => {
  const commodity = currentCommodity.value
  const location = currentLocation.value
  const currency = currentCurrency.value
  const priceList = settingsStore.defaultPriceList.value

  if (!commodity || !location || !currency || !priceList) {
    suggestedPrice.value = null
    return
  }

  try {
    loadingSuggestedPrice.value = true
    // Fetch effective prices from user's default price list for this location/currency
    const prices = await api.prices.getEffective(priceList, location, currency)
    // Find the price for the selected commodity
    const price = prices.find((p: EffectivePrice) => p.commodityTicker === commodity)
    suggestedPrice.value = price ?? null
  } catch {
    // Silently fail - price suggestion is optional
    suggestedPrice.value = null
  } finally {
    loadingSuggestedPrice.value = false
  }
}

// Apply suggested price to the form
const useSuggestedPrice = () => {
  if (!suggestedPrice.value) return

  if (activeTab.value === 'buy') {
    buyForm.value.price = suggestedPrice.value.finalPrice
    buyForm.value.currency = suggestedPrice.value.currency
  } else {
    sellForm.value.price = suggestedPrice.value.finalPrice
    sellForm.value.currency = suggestedPrice.value.currency
  }
}

const loadCommodities = async () => {
  try {
    loadingCommodities.value = true
    const data = await commodityService.getAllCommodities()
    commodities.value = data.map(c => ({
      key: c.ticker,
      display: commodityService.getCommodityDisplay(c.ticker, userStore.getCommodityDisplayMode()),
      name: c.name,
      category: c.category,
    }))
  } catch (error) {
    console.error('Failed to load commodities', error)
    errorMessage.value = 'Failed to load commodities'
  } finally {
    loadingCommodities.value = false
  }
}

const loadLocations = async () => {
  try {
    loadingLocations.value = true
    // Fetch all locations and user's storage locations in parallel
    const [data] = await Promise.all([
      locationService.getAllLocations(),
      locationService.loadUserLocations(), // Ensure user locations are cached
    ])
    locations.value = data.map(l => ({
      key: l.id,
      display: locationService.getLocationDisplay(l.id, userStore.getLocationDisplayMode()),
      locationType: l.type,
      isUserLocation: locationService.isUserLocation(l.id),
      storageTypes: locationService.getStorageTypes(l.id),
    }))
  } catch (error) {
    console.error('Failed to load locations', error)
    errorMessage.value = 'Failed to load locations'
  } finally {
    loadingLocations.value = false
  }
}

// Load user's existing sell orders to check for duplicates
const loadExistingSellOrders = async () => {
  try {
    loadingExistingOrders.value = true
    existingSellOrders.value = await api.sellOrders.list()
  } catch (error) {
    console.error('Failed to load existing sell orders', error)
    // Non-critical - just means we won't detect duplicates
    existingSellOrders.value = []
  } finally {
    loadingExistingOrders.value = false
  }
}

// Get initial usePriceList value based on settings
const getInitialUsePriceList = (): boolean => {
  return canUseDynamicPricing.value && settingsStore.automaticPricing.value
}

const resetBuyForm = () => {
  const usePriceList = getInitialUsePriceList()
  buyForm.value = {
    commodityTicker: '',
    locationId: '',
    quantity: 1,
    price: usePriceList ? 0 : 0,
    currency: userStore.getPreferredCurrency(),
    orderType: defaultOrderType.value,
    usePriceList,
    priceListCode: usePriceList ? settingsStore.defaultPriceList.value : null,
  }
}

const resetSellForm = () => {
  const usePriceList = getInitialUsePriceList()
  sellForm.value = {
    commodityTicker: props.inventoryItem?.commodityTicker ?? '',
    locationId: props.inventoryItem?.locationId ?? '',
    price: usePriceList ? 0 : 0,
    currency: userStore.getPreferredCurrency(),
    limitMode: 'none',
    limitQuantity: 0,
    orderType: defaultOrderType.value,
    usePriceList,
    priceListCode: usePriceList ? settingsStore.defaultPriceList.value : null,
  }
}

// Toggle automatic pricing for current form and save setting
const toggleAutomaticPricing = async (enable: boolean) => {
  const priceListCode = enable ? settingsStore.defaultPriceList.value : null

  // Update local form state
  if (activeTab.value === 'buy') {
    buyForm.value.usePriceList = enable
    buyForm.value.priceListCode = priceListCode
    if (enable) {
      buyForm.value.price = 0
      // Update currency from price list's effective price if available
      if (suggestedPrice.value) {
        buyForm.value.currency = suggestedPrice.value.currency
      }
    }
  } else {
    sellForm.value.usePriceList = enable
    sellForm.value.priceListCode = priceListCode
    if (enable) {
      sellForm.value.price = 0
      // Update currency from price list's effective price if available
      if (suggestedPrice.value) {
        sellForm.value.currency = suggestedPrice.value.currency
      }
    }
  }

  // Persist setting to backend
  await settingsStore.updateSetting('market.automaticPricing', enable)
}

const clearForm = () => {
  errorMessage.value = ''
  matchingOrders.value = []
  reservationQuantities.value = {}
  reservationExpirations.value = {}
  expirationMenus.value = {}
  expandedOrders.value = {}
  suggestedPrice.value = null
  if (activeTab.value === 'buy') {
    resetBuyForm()
  } else {
    resetSellForm()
  }
}

const close = () => {
  dialog.value = false
  errorMessage.value = ''
  matchingOrders.value = []
  reservationQuantities.value = {}
  reservationExpirations.value = {}
  expirationMenus.value = {}
  expandedOrders.value = {}
  suggestedPrice.value = null
  resetBuyForm()
  resetSellForm()
}

// Sync shared values between forms when switching tabs
const syncFormsOnTabChange = (newTab: OrderTab, oldTab: OrderTab) => {
  if (props.inventoryItem) return // Don't sync if inventory item is set

  if (newTab === 'sell' && oldTab === 'buy') {
    // Copy from buy to sell
    sellForm.value.commodityTicker = buyForm.value.commodityTicker
    sellForm.value.locationId = buyForm.value.locationId
    sellForm.value.price = buyForm.value.price
    sellForm.value.currency = buyForm.value.currency
    sellForm.value.orderType = buyForm.value.orderType
    sellForm.value.usePriceList = buyForm.value.usePriceList
    sellForm.value.priceListCode = buyForm.value.priceListCode
  } else if (newTab === 'buy' && oldTab === 'sell') {
    // Copy from sell to buy
    buyForm.value.commodityTicker = sellForm.value.commodityTicker
    buyForm.value.locationId = sellForm.value.locationId
    buyForm.value.price = sellForm.value.price
    buyForm.value.currency = sellForm.value.currency
    buyForm.value.orderType = sellForm.value.orderType
    buyForm.value.usePriceList = sellForm.value.usePriceList
    buyForm.value.priceListCode = sellForm.value.priceListCode
  }
}

const submitOrder = async () => {
  errorMessage.value = ''

  const formRef = activeTab.value === 'buy' ? buyFormRef.value : sellFormRef.value
  const { valid } = await formRef.validate()
  if (!valid) return

  try {
    saving.value = true

    if (activeTab.value === 'buy') {
      // Only create buy order if there's remaining quantity after reservations
      if (remainingBuyOrderQuantity.value > 0) {
        await api.buyOrders.create({
          commodityTicker: buyForm.value.commodityTicker,
          locationId: buyForm.value.locationId,
          quantity: remainingBuyOrderQuantity.value,
          price: buyForm.value.price,
          currency: buyForm.value.currency,
          orderType: buyForm.value.orderType,
          priceListCode: buyForm.value.priceListCode,
        })
      }

      // Create reservations for selected sell orders (user wants to buy from them)
      const reservationsToCreate = Object.entries(reservationQuantities.value)
        .filter(([, qty]) => qty && qty > 0)
        .map(([sellOrderId, quantity]) => {
          const expiration = reservationExpirations.value[parseInt(sellOrderId, 10)]
          return {
            sellOrderId: parseInt(sellOrderId, 10),
            quantity,
            expiresAt: expiration ? new Date(expiration).toISOString() : undefined,
          }
        })

      for (const reservation of reservationsToCreate) {
        await api.reservations.createForSellOrder(reservation)
      }
    } else {
      // Create sell order
      const commodityTicker = props.inventoryItem?.commodityTicker ?? sellForm.value.commodityTicker
      const locationId = props.inventoryItem?.locationId ?? sellForm.value.locationId

      if (!commodityTicker || !locationId) {
        errorMessage.value = 'Commodity and location are required'
        return
      }

      // For max_sell mode, reduce the limit quantity by the amount being filled
      let adjustedLimitQuantity: number | null = null
      if (sellForm.value.limitMode === 'max_sell') {
        adjustedLimitQuantity = Math.max(
          0,
          (sellForm.value.limitQuantity || 0) - totalReservationQuantity.value
        )
      } else if (sellForm.value.limitMode === 'reserve') {
        adjustedLimitQuantity = sellForm.value.limitQuantity
      }

      await api.sellOrders.create({
        commodityTicker,
        locationId,
        price: sellForm.value.price,
        currency: sellForm.value.currency,
        orderType: sellForm.value.orderType,
        limitMode: sellForm.value.limitMode,
        limitQuantity: adjustedLimitQuantity,
        priceListCode: sellForm.value.priceListCode,
      })

      // Create reservations for selected buy orders (user wants to fill/sell to them)
      const reservationsToCreate = Object.entries(reservationQuantities.value)
        .filter(([, qty]) => qty && qty > 0)
        .map(([buyOrderId, quantity]) => {
          const expiration = reservationExpirations.value[parseInt(buyOrderId, 10)]
          return {
            buyOrderId: parseInt(buyOrderId, 10),
            quantity,
            expiresAt: expiration ? new Date(expiration).toISOString() : undefined,
          }
        })

      for (const reservation of reservationsToCreate) {
        await api.reservations.createForBuyOrder(reservation)
      }
    }

    emit('created', activeTab.value)
    close()
  } catch (error) {
    console.error('Failed to create order', error)
    errorMessage.value = error instanceof Error ? error.message : 'Failed to create order'
  } finally {
    saving.value = false
  }
}

// Watch for commodity/location changes to load matching orders
watch(
  [currentCommodity, currentLocation, activeTab],
  () => {
    loadMatchingOrders()
  },
  { immediate: false }
)

// Watch for commodity/location/currency changes to load suggested price
watch(
  [currentCommodity, currentLocation, currentCurrency],
  () => {
    loadSuggestedPrice()
  },
  { immediate: false }
)

// Auto-fill price when a suggested price is loaded (only in custom pricing mode)
watch(suggestedPrice, newPrice => {
  if (!newPrice) return

  // When using price list (dynamic pricing), update the currency from the price list
  if (currentUsePriceList.value) {
    if (activeTab.value === 'buy') {
      buyForm.value.currency = newPrice.currency
    } else {
      sellForm.value.currency = newPrice.currency
    }
    return
  }

  // In custom pricing mode, optionally auto-fill if price is still 0
  // (only if automaticPricing setting is enabled, indicating user preference)
  if (!settingsStore.automaticPricing.value) return

  const currentPrice = activeTab.value === 'buy' ? buyForm.value.price : sellForm.value.price
  if (currentPrice !== 0) return

  useSuggestedPrice()
})

// Watch for tab changes to sync form values
watch(activeTab, (newTab, oldTab) => {
  if (newTab !== oldTab) {
    syncFormsOnTabChange(newTab, oldTab)
  }
})

// Load data when dialog opens
watch(dialog, open => {
  if (open) {
    errorMessage.value = ''
    activeTab.value = props.inventoryItem ? 'sell' : props.initialTab
    matchingOrders.value = []
    reservationQuantities.value = {}
    reservationExpirations.value = {}
    expirationMenus.value = {}
    expandedOrders.value = {}
    suggestedPrice.value = null
    resetBuyForm()
    resetSellForm()
    if (commodities.value.length === 0) {
      loadCommodities()
    }
    if (locations.value.length === 0) {
      loadLocations()
    }
    // Load existing sell orders to check for duplicates
    loadExistingSellOrders()
    // Load matching orders and suggested price if we have inventory item
    if (props.inventoryItem) {
      loadMatchingOrders()
      loadSuggestedPrice()
    }
    // Focus the commodity field after dialog animation
    setTimeout(() => {
      if (activeTab.value === 'buy') {
        buyCommodityRef.value?.focus()
      } else if (!props.inventoryItem) {
        sellCommodityRef.value?.focus()
      }
    }, 100)
  }
})

// Update sell form when inventory item changes
watch(
  () => props.inventoryItem,
  item => {
    if (item) {
      sellForm.value.commodityTicker = item.commodityTicker
      sellForm.value.locationId = item.locationId ?? ''
    }
  }
)

onMounted(() => {
  // Pre-load data
  loadCommodities()
  loadLocations()
})
</script>

<style scoped>
.matching-orders-table {
  font-size: 0.875rem;
}

.matching-orders-table th {
  font-weight: 500;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.matching-orders-table .order-row {
  cursor: pointer;
}

.matching-orders-table .order-row:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08) !important;
}

.matching-orders-table .order-row.alt-row {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

.matching-orders-table .expand-icon {
  opacity: 0.6;
}

.reservation-qty-input {
  max-width: 80px;
}

.reservation-qty-input :deep(.v-field__input) {
  padding: 4px 8px;
  min-height: 28px;
  font-size: 0.875rem;
}

.expiration-display {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  white-space: nowrap;
}

.expiration-display:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
}

.min-width-0 {
  min-width: 0;
}

.cursor-help {
  cursor: help;
}
</style>
