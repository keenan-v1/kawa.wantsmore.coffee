<template>
  <v-container fluid>
    <h1 class="text-h4 mb-4">My Orders</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="buy">
        <v-icon start>mdi-cart</v-icon>
        Buy Orders
        <v-badge
          v-if="buyOrders.length > 0"
          :content="buyOrders.length"
          color="primary"
          inline
          class="ml-2"
        />
      </v-tab>
      <v-tab value="sell">
        <v-icon start>mdi-tag</v-icon>
        Sell Orders
        <v-badge
          v-if="sellOrders.length > 0"
          :content="sellOrders.length"
          color="success"
          inline
          class="ml-2"
        />
      </v-tab>
      <v-tab value="reservations">
        <v-icon start>mdi-clipboard-check</v-icon>
        Reservations
        <v-badge
          v-if="activeReservationsCount > 0"
          :content="activeReservationsCount"
          color="warning"
          inline
          class="ml-2"
        />
      </v-tab>
    </v-tabs>

    <v-tabs-window v-model="activeTab">
      <!-- SELL ORDERS TAB -->
      <v-tabs-window-item value="sell">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="sellSearch"
                  prepend-icon="mdi-magnify"
                  label="Search sell orders..."
                  single-line
                  hide-details
                  clearable
                  density="compact"
                />
              </v-col>
              <v-col cols="12" md="6" class="text-right">
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="success"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openSellOrderDialog"
                      >
                        Create Sell Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </v-col>
            </v-row>
          </v-card-title>

          <v-data-table
            :headers="sellHeaders"
            :items="filteredSellOrders"
            :loading="loadingSell"
            :items-per-page="25"
            class="elevation-0"
          >
            <template #item.commodityTicker="{ item }">
              <span class="font-weight-medium">{{
                getCommodityDisplay(item.commodityTicker)
              }}</span>
            </template>

            <template #item.locationId="{ item }">
              {{ getLocationDisplay(item.locationId) }}
            </template>

            <template #item.price="{ item }">
              <div class="d-flex align-center">
                <template v-if="getSellOrderDisplayPrice(item) !== null">
                  <span class="font-weight-medium">{{
                    formatPrice(getSellOrderDisplayPrice(item)!)
                  }}</span>
                  <span class="text-medium-emphasis ml-1">{{ item.currency }}</span>
                </template>
                <span v-else class="text-medium-emphasis">--</span>
                <v-chip
                  v-if="item.priceListCode"
                  size="x-small"
                  color="info"
                  variant="tonal"
                  class="ml-2"
                >
                  {{ item.priceListCode }}
                </v-chip>
                <v-chip v-else size="x-small" color="default" variant="outlined" class="ml-2">
                  Custom
                </v-chip>
              </div>
            </template>

            <template #item.availableQuantity="{ item }">
              <v-tooltip location="top">
                <template #activator="{ props }">
                  <div v-bind="props">
                    <span class="font-weight-medium">{{
                      item.remainingQuantity.toLocaleString()
                    }}</span>
                    <span v-if="item.reservedQuantity > 0" class="text-medium-emphasis">
                      / {{ item.availableQuantity.toLocaleString() }}
                    </span>
                  </div>
                </template>
                <div>
                  <div>FIO Inventory: {{ item.fioQuantity.toLocaleString() }}</div>
                  <div>Available: {{ item.availableQuantity.toLocaleString() }}</div>
                  <div v-if="item.reservedQuantity > 0">
                    Reserved: {{ item.reservedQuantity.toLocaleString() }}
                  </div>
                  <div>Remaining: {{ item.remainingQuantity.toLocaleString() }}</div>
                </div>
              </v-tooltip>
              <div v-if="item.limitMode !== 'none'" class="text-caption text-medium-emphasis">
                {{ getLimitModeLabel(item.limitMode) }}
                <span v-if="item.limitQuantity">: {{ item.limitQuantity.toLocaleString() }}</span>
              </div>
            </template>

            <template #item.activeReservationCount="{ item }">
              <v-chip
                v-if="item.activeReservationCount > 0"
                size="small"
                color="primary"
                variant="tonal"
                class="cursor-pointer"
                @click="viewSellOrder(item)"
              >
                {{ item.activeReservationCount }}
              </v-chip>
              <span v-else class="text-medium-emphasis">-</span>
            </template>

            <template #item.orderType="{ item }">
              <OrderTypeChip :order-type="item.orderType" />
            </template>

            <template #item.actions="{ item }">
              <div class="d-flex ga-1">
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="viewSellOrder(item)"
                    >
                      <v-icon>mdi-eye</v-icon>
                    </v-btn>
                  </template>
                  View order
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="openEditSellDialog(item)"
                    >
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                  </template>
                  Edit order
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      @click="confirmDeleteSell(item)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </template>
                  Delete order
                </v-tooltip>
              </div>
            </template>

            <template #no-data>
              <div class="text-center py-8">
                <v-icon size="64" color="grey-lighten-1">mdi-tag-multiple</v-icon>
                <p class="text-h6 mt-4">No sell orders</p>
                <p class="text-body-2 text-medium-emphasis">
                  Create sell orders to list items for sale
                </p>
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="success"
                        class="mt-4"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openSellOrderDialog"
                      >
                        Create Sell Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-tabs-window-item>

      <!-- BUY ORDERS TAB -->
      <v-tabs-window-item value="buy">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="buySearch"
                  prepend-icon="mdi-magnify"
                  label="Search buy orders..."
                  single-line
                  hide-details
                  clearable
                  density="compact"
                />
              </v-col>
              <v-col cols="12" md="6" class="text-right">
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="primary"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openBuyOrderDialog"
                      >
                        Create Buy Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </v-col>
            </v-row>
          </v-card-title>

          <v-data-table
            :headers="buyHeaders"
            :items="filteredBuyOrders"
            :loading="loadingBuy"
            :items-per-page="25"
            class="elevation-0"
          >
            <template #item.commodityTicker="{ item }">
              <span class="font-weight-medium">{{
                getCommodityDisplay(item.commodityTicker)
              }}</span>
            </template>

            <template #item.locationId="{ item }">
              {{ getLocationDisplay(item.locationId) }}
            </template>

            <template #item.price="{ item }">
              <div class="d-flex align-center">
                <template v-if="getBuyOrderDisplayPrice(item) !== null">
                  <span class="font-weight-medium">{{
                    formatPrice(getBuyOrderDisplayPrice(item)!)
                  }}</span>
                  <span class="text-medium-emphasis ml-1">{{ item.currency }}</span>
                </template>
                <span v-else class="text-medium-emphasis">--</span>
                <v-chip
                  v-if="item.priceListCode"
                  size="x-small"
                  color="info"
                  variant="tonal"
                  class="ml-2"
                >
                  {{ item.priceListCode }}
                </v-chip>
                <v-chip v-else size="x-small" color="default" variant="outlined" class="ml-2">
                  Custom
                </v-chip>
              </div>
            </template>

            <template #item.quantity="{ item }">
              <v-tooltip location="top">
                <template #activator="{ props }">
                  <span v-bind="props" class="font-weight-medium">
                    {{ item.remainingQuantity.toLocaleString() }}
                    <span v-if="item.reservedQuantity > 0" class="text-medium-emphasis">
                      / {{ item.quantity.toLocaleString() }}
                    </span>
                  </span>
                </template>
                <div>
                  <div>Total: {{ item.quantity.toLocaleString() }}</div>
                  <div v-if="item.reservedQuantity > 0">
                    Filled: {{ item.reservedQuantity.toLocaleString() }}
                  </div>
                  <div>Remaining: {{ item.remainingQuantity.toLocaleString() }}</div>
                </div>
              </v-tooltip>
            </template>

            <template #item.activeReservationCount="{ item }">
              <v-chip
                v-if="item.activeReservationCount > 0"
                size="small"
                color="primary"
                variant="tonal"
                class="cursor-pointer"
                @click="viewBuyOrder(item)"
              >
                {{ item.activeReservationCount }}
              </v-chip>
              <span v-else class="text-medium-emphasis">-</span>
            </template>

            <template #item.orderType="{ item }">
              <OrderTypeChip :order-type="item.orderType" />
            </template>

            <template #item.actions="{ item }">
              <div class="d-flex ga-1">
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="viewBuyOrder(item)"
                    >
                      <v-icon>mdi-eye</v-icon>
                    </v-btn>
                  </template>
                  View order
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="openEditBuyDialog(item)"
                    >
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                  </template>
                  Edit order
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      @click="confirmDeleteBuy(item)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </template>
                  Delete order
                </v-tooltip>
              </div>
            </template>

            <template #no-data>
              <div class="text-center py-8">
                <v-icon size="64" color="grey-lighten-1">mdi-cart</v-icon>
                <p class="text-h6 mt-4">No buy orders</p>
                <p class="text-body-2 text-medium-emphasis">
                  Create buy orders to request items from other members
                </p>
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="primary"
                        class="mt-4"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openBuyOrderDialog"
                      >
                        Create Buy Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-tabs-window-item>

      <!-- RESERVATIONS TAB -->
      <v-tabs-window-item value="reservations">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col cols="12" md="4">
                <v-text-field
                  v-model="reservationSearch"
                  prepend-icon="mdi-magnify"
                  label="Search reservations..."
                  single-line
                  hide-details
                  clearable
                  density="compact"
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="reservationRoleFilter"
                  :items="reservationRoleOptions"
                  item-title="title"
                  item-value="value"
                  label="Role"
                  density="compact"
                  hide-details
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="reservationStatusFilter"
                  :items="reservationStatusOptions"
                  item-title="title"
                  item-value="value"
                  label="Status"
                  density="compact"
                  hide-details
                  clearable
                />
              </v-col>
            </v-row>
          </v-card-title>

          <!-- Reservation Summary Card -->
          <v-card-text v-if="activeReservations.length > 0" class="pt-0 pb-4">
            <v-row dense>
              <!-- Counts -->
              <v-col cols="12" md="3">
                <div class="text-caption text-medium-emphasis mb-1">Active Reservations</div>
                <div class="d-flex align-center ga-4">
                  <div>
                    <span class="text-h5 font-weight-bold">{{ activeReservations.length }}</span>
                    <span class="text-caption text-medium-emphasis ml-1">open</span>
                  </div>
                  <v-divider vertical class="mx-2" />
                  <div>
                    <v-chip size="small" color="success" variant="tonal" class="mr-1">
                      {{ fillReservations.length }}
                    </v-chip>
                    <span class="text-caption">fills</span>
                  </div>
                  <div>
                    <v-chip size="small" color="warning" variant="tonal" class="mr-1">
                      {{ reserveReservations.length }}
                    </v-chip>
                    <span class="text-caption">reserves</span>
                  </div>
                </div>
              </v-col>

              <!-- Fills Total -->
              <v-col cols="12" md="3">
                <div class="text-caption text-medium-emphasis mb-1">
                  <v-icon size="small" class="mr-1">mdi-arrow-down</v-icon>
                  Fills (Incoming)
                </div>
                <div v-if="Object.keys(fillTotalsByCurrency).length > 0">
                  <div
                    v-for="(amount, currency) in fillTotalsByCurrency"
                    :key="currency"
                    class="text-success"
                  >
                    <span class="font-weight-medium">+{{ formatPrice(amount) }}</span>
                    <span class="text-caption ml-1">{{ currency }}</span>
                  </div>
                </div>
                <div v-else class="text-medium-emphasis">--</div>
              </v-col>

              <!-- Reserves Total -->
              <v-col cols="12" md="3">
                <div class="text-caption text-medium-emphasis mb-1">
                  <v-icon size="small" class="mr-1">mdi-arrow-up</v-icon>
                  Reserves (Outgoing)
                </div>
                <div v-if="Object.keys(reserveTotalsByCurrency).length > 0">
                  <div
                    v-for="(amount, currency) in reserveTotalsByCurrency"
                    :key="currency"
                    class="text-warning"
                  >
                    <span class="font-weight-medium">-{{ formatPrice(amount) }}</span>
                    <span class="text-caption ml-1">{{ currency }}</span>
                  </div>
                </div>
                <div v-else class="text-medium-emphasis">--</div>
              </v-col>

              <!-- Net Total -->
              <v-col cols="12" md="3">
                <div class="text-caption text-medium-emphasis mb-1">
                  <v-icon size="small" class="mr-1">mdi-scale-balance</v-icon>
                  Net Position
                </div>
                <div v-if="Object.keys(netTotalsByCurrency).length > 0">
                  <div
                    v-for="(amount, currency) in netTotalsByCurrency"
                    :key="currency"
                    :class="amount >= 0 ? 'text-success' : 'text-error'"
                  >
                    <span class="font-weight-medium">
                      {{ amount >= 0 ? '+' : '' }}{{ formatPrice(amount) }}
                    </span>
                    <span class="text-caption ml-1">{{ currency }}</span>
                  </div>
                </div>
                <div v-else class="text-medium-emphasis">--</div>
              </v-col>
            </v-row>
          </v-card-text>

          <v-divider v-if="activeReservations.length > 0" />

          <v-data-table
            :headers="reservationHeaders"
            :items="filteredReservations"
            :loading="loadingReservations"
            :items-per-page="25"
            class="elevation-0"
          >
            <template #item.orderType="{ item }">
              <v-chip
                :color="item.sellOrderId ? 'warning' : 'info'"
                size="x-small"
                variant="outlined"
              >
                {{ item.sellOrderId ? 'Sell' : 'Buy' }}
              </v-chip>
            </template>

            <template #item.commodityTicker="{ item }">
              <span class="font-weight-medium">{{
                getCommodityDisplay(item.commodityTicker)
              }}</span>
            </template>

            <template #item.locationId="{ item }">
              {{ getLocationDisplay(item.locationId) }}
            </template>

            <template #item.counterparty="{ item }">
              {{ item.isOrderOwner ? item.counterpartyName : item.orderOwnerName }}
            </template>

            <template #item.price="{ item }">
              <div class="text-right">
                <template v-if="getReservationDisplayPrice(item) !== null">
                  <span class="font-weight-medium">{{
                    formatPrice(getReservationDisplayPrice(item)!)
                  }}</span>
                  <span class="text-medium-emphasis ml-1">{{ item.currency }}</span>
                  <v-chip
                    v-if="item.priceListCode"
                    size="x-small"
                    color="info"
                    variant="tonal"
                    class="ml-1"
                  >
                    {{ item.priceListCode }}
                  </v-chip>
                </template>
                <span v-else class="text-medium-emphasis">--</span>
              </div>
            </template>

            <template #item.quantity="{ item }">
              <span class="font-weight-medium">{{ item.quantity.toLocaleString() }}</span>
            </template>

            <template #item.total="{ item }">
              <div class="text-right">
                <template v-if="getReservationDisplayPrice(item) !== null">
                  <span class="font-weight-medium">{{
                    formatPrice(getReservationDisplayPrice(item)! * item.quantity)
                  }}</span>
                  <span class="text-medium-emphasis ml-1">{{ item.currency }}</span>
                </template>
                <span v-else class="text-medium-emphasis">--</span>
              </div>
            </template>

            <template #item.status="{ item }">
              <ReservationStatusChip :status="item.status" size="small" />
            </template>

            <template #item.expiresAt="{ item }">
              <span v-if="item.expiresAt" class="text-caption">
                {{ formatDate(item.expiresAt) }}
              </span>
              <span v-else class="text-medium-emphasis">-</span>
            </template>

            <template #item.notes="{ item }">
              <v-tooltip v-if="item.notes" location="top" max-width="300">
                <template #activator="{ props }">
                  <v-icon v-bind="props" size="small" color="info">mdi-note-text</v-icon>
                </template>
                {{ item.notes }}
              </v-tooltip>
            </template>

            <template #item.actions="{ item }">
              <div class="d-flex ga-1">
                <!-- Order Owner Actions -->
                <template v-if="item.isOrderOwner">
                  <!-- Pending: Confirm / Reject -->
                  <template v-if="item.status === 'pending'">
                    <v-tooltip location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          size="small"
                          variant="text"
                          color="success"
                          :loading="reservationActionLoading === `confirm-${item.id}`"
                          @click="confirmReservation(item.id)"
                        >
                          <v-icon>mdi-check</v-icon>
                        </v-btn>
                      </template>
                      Confirm
                    </v-tooltip>
                    <v-tooltip location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          size="small"
                          variant="text"
                          color="error"
                          :loading="reservationActionLoading === `reject-${item.id}`"
                          @click="rejectReservation(item.id)"
                        >
                          <v-icon>mdi-close</v-icon>
                        </v-btn>
                      </template>
                      Reject
                    </v-tooltip>
                  </template>
                  <!-- Confirmed: Fulfill / Cancel -->
                  <template v-if="item.status === 'confirmed'">
                    <v-tooltip location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          size="small"
                          variant="text"
                          color="success"
                          :loading="reservationActionLoading === `fulfill-${item.id}`"
                          @click="fulfillReservation(item.id)"
                        >
                          <v-icon>mdi-check-all</v-icon>
                        </v-btn>
                      </template>
                      Mark Fulfilled
                    </v-tooltip>
                    <v-tooltip location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          size="small"
                          variant="text"
                          color="warning"
                          :loading="reservationActionLoading === `cancel-${item.id}`"
                          @click="cancelReservation(item.id)"
                        >
                          <v-icon>mdi-cancel</v-icon>
                        </v-btn>
                      </template>
                      Cancel
                    </v-tooltip>
                  </template>
                </template>

                <!-- Counterparty Actions -->
                <template v-if="item.isCounterparty">
                  <!-- Pending/Confirmed: Fulfill / Cancel -->
                  <template v-if="item.status === 'pending' || item.status === 'confirmed'">
                    <v-tooltip location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          size="small"
                          variant="text"
                          color="success"
                          :loading="reservationActionLoading === `fulfill-${item.id}`"
                          @click="fulfillReservation(item.id)"
                        >
                          <v-icon>mdi-check-all</v-icon>
                        </v-btn>
                      </template>
                      Mark Fulfilled
                    </v-tooltip>
                    <v-tooltip location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          size="small"
                          variant="text"
                          color="warning"
                          :loading="reservationActionLoading === `cancel-${item.id}`"
                          @click="cancelReservation(item.id)"
                        >
                          <v-icon>mdi-cancel</v-icon>
                        </v-btn>
                      </template>
                      Cancel
                    </v-tooltip>
                  </template>
                  <!-- Cancelled: Reopen -->
                  <template v-if="item.status === 'cancelled'">
                    <v-tooltip location="top">
                      <template #activator="{ props }">
                        <v-btn
                          v-bind="props"
                          icon
                          size="small"
                          variant="text"
                          color="primary"
                          :loading="reservationActionLoading === `reopen-${item.id}`"
                          @click="reopenReservation(item.id)"
                        >
                          <v-icon>mdi-refresh</v-icon>
                        </v-btn>
                      </template>
                      Reopen
                    </v-tooltip>
                  </template>
                </template>
              </div>
            </template>

            <template #no-data>
              <div class="text-center py-8">
                <v-icon size="64" color="grey-lighten-1">mdi-clipboard-check</v-icon>
                <p class="text-h6 mt-4">No reservations</p>
                <p class="text-body-2 text-medium-emphasis">
                  Reservations you've made or received will appear here
                </p>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-tabs-window-item>
    </v-tabs-window>

    <!-- Order Dialog -->
    <OrderDialog v-model="orderDialog" :initial-tab="orderDialogTab" @created="onOrderCreated" />

    <!-- Order Detail Dialog -->
    <OrderDetailDialog
      v-model="orderDetailDialog"
      :order-type="orderDetailType"
      :order-id="orderDetailId"
      @deleted="onOrderDeleted"
      @updated="onOrderUpdated"
    />

    <!-- Edit Sell Order Dialog -->
    <SellOrderEditDialog
      v-model="editSellDialog"
      :order="editingSellOrder"
      @saved="onSellOrderSaved"
    />

    <!-- Edit Buy Order Dialog -->
    <BuyOrderEditDialog v-model="editBuyDialog" :order="editingBuyOrder" @saved="onBuyOrderSaved" />

    <!-- Delete Sell Order Confirmation -->
    <v-dialog v-model="deleteSellDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Sell Order</v-card-title>
        <v-card-text>
          Are you sure you want to delete the sell order for
          <strong>{{
            deletingSellOrder ? getCommodityDisplay(deletingSellOrder.commodityTicker) : ''
          }}</strong>
          at
          <strong>{{
            deletingSellOrder ? getLocationDisplay(deletingSellOrder.locationId) : ''
          }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteSellDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingSell" @click="deleteSellOrder"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Buy Order Confirmation -->
    <v-dialog v-model="deleteBuyDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Buy Order</v-card-title>
        <v-card-text>
          Are you sure you want to delete the buy order for
          <strong>{{
            deletingBuyOrder ? getCommodityDisplay(deletingBuyOrder.commodityTicker) : ''
          }}</strong>
          at
          <strong>{{
            deletingBuyOrder ? getLocationDisplay(deletingBuyOrder.locationId) : ''
          }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteBuyDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingBuy" @click="deleteBuyOrder"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useUrlTab, useOrderDeepLink } from '../composables'
import { PERMISSIONS, type SellOrderLimitMode, type OrderType } from '@kawakawa/types'
import {
  api,
  type SellOrderResponse,
  type BuyOrderResponse,
  type ReservationWithDetails,
  type ReservationStatus,
} from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import OrderDialog from '../components/OrderDialog.vue'
import OrderDetailDialog from '../components/OrderDetailDialog.vue'
import SellOrderEditDialog from '../components/SellOrderEditDialog.vue'
import BuyOrderEditDialog from '../components/BuyOrderEditDialog.vue'
import ReservationStatusChip from '../components/ReservationStatusChip.vue'
import OrderTypeChip from '../components/OrderTypeChip.vue'

const userStore = useUserStore()

// Display helpers that respect user preferences
const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

const ORDERS_TABS = ['buy', 'sell', 'reservations'] as const
const activeTab = useUrlTab({
  validTabs: ORDERS_TABS,
  defaultTab: 'buy',
})

const sellHeaders = [
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'Price', key: 'price', sortable: true },
  { title: 'Available', key: 'availableQuantity', sortable: true, align: 'end' as const },
  {
    title: 'Reservations',
    key: 'activeReservationCount',
    sortable: true,
    align: 'center' as const,
  },
  { title: 'Type', key: 'orderType', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, width: 120 },
]

const buyHeaders = [
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'Price', key: 'price', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true, align: 'end' as const },
  {
    title: 'Reservations',
    key: 'activeReservationCount',
    sortable: true,
    align: 'center' as const,
  },
  { title: 'Type', key: 'orderType', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, width: 120 },
]

const reservationHeaders = [
  { title: 'Order', key: 'orderType', sortable: false, width: 60 },
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'With', key: 'counterparty', sortable: true },
  { title: 'Price/Unit', key: 'price', sortable: true, align: 'end' as const },
  { title: 'Qty', key: 'quantity', sortable: true, align: 'end' as const },
  { title: 'Total', key: 'total', sortable: true, align: 'end' as const },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Expires', key: 'expiresAt', sortable: true },
  { title: '', key: 'notes', sortable: false, width: 40 },
  { title: 'Actions', key: 'actions', sortable: false, width: 120 },
]

const reservationRoleOptions = [
  { title: 'All', value: 'all' },
  { title: 'My Orders', value: 'owner' },
  { title: 'I Reserved', value: 'counterparty' },
]

const reservationStatusOptions = [
  { title: 'All Statuses', value: null },
  { title: 'Pending', value: 'pending' },
  { title: 'Confirmed', value: 'confirmed' },
  { title: 'Fulfilled', value: 'fulfilled' },
  { title: 'Rejected', value: 'rejected' },
  { title: 'Cancelled', value: 'cancelled' },
  { title: 'Expired', value: 'expired' },
]

// Sell orders state
const sellOrders = ref<SellOrderResponse[]>([])
const loadingSell = ref(false)
const sellSearch = ref('')

// Buy orders state
const buyOrders = ref<BuyOrderResponse[]>([])
const loadingBuy = ref(false)
const buySearch = ref('')
const orderDialog = ref(false)
const orderDialogTab = ref<'buy' | 'sell'>('buy')

// Reservations state
const reservations = ref<ReservationWithDetails[]>([])
const loadingReservations = ref(false)
const reservationSearch = ref('')
const reservationRoleFilter = ref<'all' | 'owner' | 'counterparty'>('all')
const reservationStatusFilter = ref<ReservationStatus | null>(null)
const reservationActionLoading = ref<string | null>(null)

// Order detail dialog with deep linking
const {
  dialogOpen: orderDetailDialog,
  orderType: orderDetailType,
  orderId: orderDetailId,
  openOrder,
} = useOrderDeepLink()

// Edit sell order state
const editSellDialog = ref(false)
const editingSellOrder = ref<SellOrderResponse | null>(null)

// Edit buy order state
const editBuyDialog = ref(false)
const editingBuyOrder = ref<BuyOrderResponse | null>(null)

// Delete state
const deleteSellDialog = ref(false)
const deletingSellOrder = ref<SellOrderResponse | null>(null)
const deletingSell = ref(false)

const deleteBuyDialog = ref(false)
const deletingBuyOrder = ref<BuyOrderResponse | null>(null)
const deletingBuy = ref(false)

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

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

// Check if user can create any orders at all
const canCreateAnyOrders = computed(() => orderTypes.value.length > 0)

const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = { show: true, message, color }
}

const filteredSellOrders = computed(() => {
  if (!sellSearch.value) return sellOrders.value
  const searchLower = sellSearch.value.toLowerCase()
  return sellOrders.value.filter(
    order =>
      order.commodityTicker.toLowerCase().includes(searchLower) ||
      order.locationId.toLowerCase().includes(searchLower)
  )
})

const filteredBuyOrders = computed(() => {
  if (!buySearch.value) return buyOrders.value
  const searchLower = buySearch.value.toLowerCase()
  return buyOrders.value.filter(
    order =>
      order.commodityTicker.toLowerCase().includes(searchLower) ||
      order.locationId.toLowerCase().includes(searchLower)
  )
})

const filteredReservations = computed(() => {
  let result = reservations.value

  // Filter by role
  if (reservationRoleFilter.value === 'owner') {
    result = result.filter(r => r.isOrderOwner)
  } else if (reservationRoleFilter.value === 'counterparty') {
    result = result.filter(r => r.isCounterparty)
  }

  // Filter by status
  if (reservationStatusFilter.value) {
    result = result.filter(r => r.status === reservationStatusFilter.value)
  }

  // Filter by search
  if (reservationSearch.value) {
    const searchLower = reservationSearch.value.toLowerCase()
    result = result.filter(
      r =>
        r.commodityTicker.toLowerCase().includes(searchLower) ||
        r.locationId.toLowerCase().includes(searchLower) ||
        r.counterpartyName.toLowerCase().includes(searchLower) ||
        r.orderOwnerName.toLowerCase().includes(searchLower)
    )
  }

  return result
})

const activeReservationsCount = computed(() => {
  return reservations.value.filter(r => r.status === 'pending' || r.status === 'confirmed').length
})

// Summary statistics for reservations - only count active (pending/confirmed) reservations
const activeReservations = computed(() => {
  return reservations.value.filter(r => r.status === 'pending' || r.status === 'confirmed')
})

// Fills: reservations where I'm filling someone else's buy order (I'm selling, money coming in)
const fillReservations = computed(() => {
  return activeReservations.value.filter(r => r.buyOrderId && r.isCounterparty)
})

// Reserves: reservations where I'm reserving from someone else's sell order (I'm buying, money going out)
const reserveReservations = computed(() => {
  return activeReservations.value.filter(r => r.sellOrderId && r.isCounterparty)
})

// Calculate totals by currency
type CurrencyTotals = Record<string, number>

const fillTotalsByCurrency = computed((): CurrencyTotals => {
  const totals: CurrencyTotals = {}
  for (const r of fillReservations.value) {
    const price = getReservationDisplayPrice(r)
    if (price !== null) {
      const total = price * r.quantity
      totals[r.currency] = (totals[r.currency] ?? 0) + total
    }
  }
  return totals
})

const reserveTotalsByCurrency = computed((): CurrencyTotals => {
  const totals: CurrencyTotals = {}
  for (const r of reserveReservations.value) {
    const price = getReservationDisplayPrice(r)
    if (price !== null) {
      const total = price * r.quantity
      totals[r.currency] = (totals[r.currency] ?? 0) + total
    }
  }
  return totals
})

const netTotalsByCurrency = computed((): CurrencyTotals => {
  const fills = fillTotalsByCurrency.value
  const reserves = reserveTotalsByCurrency.value
  const currencies = new Set([...Object.keys(fills), ...Object.keys(reserves)])
  const totals: CurrencyTotals = {}
  for (const currency of currencies) {
    const net = (fills[currency] ?? 0) - (reserves[currency] ?? 0)
    if (net !== 0) {
      totals[currency] = net
    }
  }
  return totals
})

const formatPrice = (price: number): string => {
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Get the display price for a sell order - uses effectivePrice for dynamic pricing
const getSellOrderDisplayPrice = (item: SellOrderResponse): number | null => {
  if (item.pricingMode === 'dynamic') {
    return item.effectivePrice
  }
  return item.price > 0 ? item.price : null
}

// Get the display price for a buy order - uses effectivePrice for dynamic pricing
const getBuyOrderDisplayPrice = (item: BuyOrderResponse): number | null => {
  if (item.pricingMode === 'dynamic') {
    return item.effectivePrice
  }
  return item.price > 0 ? item.price : null
}

// Get the display price for a reservation - uses effectivePrice for dynamic pricing
const getReservationDisplayPrice = (item: ReservationWithDetails): number | null => {
  if (item.pricingMode === 'dynamic') {
    return item.effectivePrice
  }
  return item.price > 0 ? item.price : null
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getLimitModeLabel = (mode: SellOrderLimitMode): string => {
  switch (mode) {
    case 'max_sell':
      return 'Max sell'
    case 'reserve':
      return 'Reserve'
    default:
      return ''
  }
}

// Load functions
const loadSellOrders = async () => {
  try {
    loadingSell.value = true
    sellOrders.value = await api.sellOrders.list()
  } catch (error) {
    console.error('Failed to load sell orders', error)
    showSnackbar('Failed to load sell orders', 'error')
  } finally {
    loadingSell.value = false
  }
}

const loadBuyOrders = async () => {
  try {
    loadingBuy.value = true
    buyOrders.value = await api.buyOrders.list()
  } catch (error) {
    console.error('Failed to load buy orders', error)
    showSnackbar('Failed to load buy orders', 'error')
  } finally {
    loadingBuy.value = false
  }
}

const loadReservations = async () => {
  try {
    loadingReservations.value = true
    // Load all reservations (both as owner and counterparty)
    reservations.value = await api.reservations.list('all')
  } catch (error) {
    console.error('Failed to load reservations', error)
    showSnackbar('Failed to load reservations', 'error')
  } finally {
    loadingReservations.value = false
  }
}

// Reservation actions
const confirmReservation = async (id: number) => {
  try {
    reservationActionLoading.value = `confirm-${id}`
    await api.reservations.confirm(id)
    showSnackbar('Reservation confirmed')
    await loadReservations()
  } catch (error) {
    console.error('Failed to confirm reservation', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to confirm reservation', 'error')
  } finally {
    reservationActionLoading.value = null
  }
}

const rejectReservation = async (id: number) => {
  try {
    reservationActionLoading.value = `reject-${id}`
    await api.reservations.reject(id)
    showSnackbar('Reservation rejected')
    await loadReservations()
  } catch (error) {
    console.error('Failed to reject reservation', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to reject reservation', 'error')
  } finally {
    reservationActionLoading.value = null
  }
}

const fulfillReservation = async (id: number) => {
  try {
    reservationActionLoading.value = `fulfill-${id}`
    await api.reservations.fulfill(id)
    showSnackbar('Reservation marked as fulfilled')
    await loadReservations()
  } catch (error) {
    console.error('Failed to fulfill reservation', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to fulfill reservation', 'error')
  } finally {
    reservationActionLoading.value = null
  }
}

const cancelReservation = async (id: number) => {
  try {
    reservationActionLoading.value = `cancel-${id}`
    await api.reservations.cancel(id)
    showSnackbar('Reservation cancelled')
    await loadReservations()
  } catch (error) {
    console.error('Failed to cancel reservation', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to cancel reservation', 'error')
  } finally {
    reservationActionLoading.value = null
  }
}

const reopenReservation = async (id: number) => {
  try {
    reservationActionLoading.value = `reopen-${id}`
    await api.reservations.reopen(id)
    showSnackbar('Reservation reopened')
    await loadReservations()
  } catch (error) {
    console.error('Failed to reopen reservation', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to reopen reservation', 'error')
  } finally {
    reservationActionLoading.value = null
  }
}

// Open order dialogs
const openBuyOrderDialog = () => {
  orderDialogTab.value = 'buy'
  orderDialog.value = true
}

const openSellOrderDialog = () => {
  orderDialogTab.value = 'sell'
  orderDialog.value = true
}

// View order functions
const viewSellOrder = (order: SellOrderResponse) => {
  openOrder('sell', order.id)
}

const viewBuyOrder = (order: BuyOrderResponse) => {
  openOrder('buy', order.id)
}

// Handler for OrderDialog creation
const onOrderCreated = async (type: 'buy' | 'sell') => {
  if (type === 'buy') {
    await loadBuyOrders()
  } else {
    await loadSellOrders()
  }
}

// Handlers for OrderDetailDialog events
const onOrderDeleted = async () => {
  if (orderDetailType.value === 'buy') {
    await loadBuyOrders()
  } else {
    await loadSellOrders()
  }
}

const onOrderUpdated = async () => {
  if (orderDetailType.value === 'buy') {
    await loadBuyOrders()
  } else {
    await loadSellOrders()
  }
}

// Edit sell order functions
const openEditSellDialog = (order: SellOrderResponse) => {
  editingSellOrder.value = order
  editSellDialog.value = true
}

const onSellOrderSaved = () => {
  showSnackbar('Sell order updated successfully')
  loadSellOrders()
}

// Edit buy order functions
const openEditBuyDialog = (order: BuyOrderResponse) => {
  editingBuyOrder.value = order
  editBuyDialog.value = true
}

const onBuyOrderSaved = () => {
  showSnackbar('Buy order updated successfully')
  loadBuyOrders()
}

// Delete sell order functions
const confirmDeleteSell = (order: SellOrderResponse) => {
  deletingSellOrder.value = order
  deleteSellDialog.value = true
}

const deleteSellOrder = async () => {
  if (!deletingSellOrder.value) return

  try {
    deletingSell.value = true
    await api.sellOrders.delete(deletingSellOrder.value.id)
    showSnackbar('Sell order deleted successfully')
    deleteSellDialog.value = false
    await loadSellOrders()
  } catch (error) {
    console.error('Failed to delete sell order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete sell order'
    showSnackbar(message, 'error')
  } finally {
    deletingSell.value = false
  }
}

// Delete buy order functions
const confirmDeleteBuy = (order: BuyOrderResponse) => {
  deletingBuyOrder.value = order
  deleteBuyDialog.value = true
}

const deleteBuyOrder = async () => {
  if (!deletingBuyOrder.value) return

  try {
    deletingBuy.value = true
    await api.buyOrders.delete(deletingBuyOrder.value.id)
    showSnackbar('Buy order deleted successfully')
    deleteBuyDialog.value = false
    await loadBuyOrders()
  } catch (error) {
    console.error('Failed to delete buy order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete buy order'
    showSnackbar(message, 'error')
  } finally {
    deletingBuy.value = false
  }
}

onMounted(() => {
  loadSellOrders()
  loadBuyOrders()
  loadReservations()
})
</script>
