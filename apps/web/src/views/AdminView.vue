<template>
  <v-container>
    <h1 class="text-h4 mb-4">Administration</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="approvals">
        Pending Approvals
        <v-badge
          v-if="pendingApprovals.length > 0"
          :content="pendingApprovals.length"
          color="error"
          inline
          class="ml-2"
        />
      </v-tab>
      <v-tab value="users">User Management</v-tab>
      <v-tab value="permissions">Permissions</v-tab>
      <v-tab value="roles">Roles</v-tab>
      <v-tab value="discord">Discord</v-tab>
      <v-tab value="priceLists">Price Lists</v-tab>
      <v-tab value="globalDefaults">Global Defaults</v-tab>
    </v-tabs>

    <v-tabs-window v-model="activeTab">
      <!-- PENDING APPROVALS TAB -->
      <v-tabs-window-item value="approvals">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col>
                <span>Pending User Approvals</span>
              </v-col>
              <v-col cols="auto">
                <v-btn
                  color="primary"
                  variant="text"
                  prepend-icon="mdi-refresh"
                  :loading="loadingApprovals"
                  @click="loadPendingApprovals"
                >
                  Refresh
                </v-btn>
              </v-col>
            </v-row>
          </v-card-title>

          <v-card-text v-if="pendingApprovals.length === 0 && !loadingApprovals">
            <v-alert type="success" variant="tonal">
              No users pending approval. All registrations have been reviewed.
            </v-alert>
          </v-card-text>

          <v-list v-else lines="two">
            <v-list-item v-for="user in pendingApprovals" :key="user.id">
              <template #prepend>
                <v-avatar color="grey">
                  <v-icon>mdi-account</v-icon>
                </v-avatar>
              </template>

              <v-list-item-title class="font-weight-medium">
                {{ user.displayName }}
              </v-list-item-title>
              <v-list-item-subtitle>
                @{{ user.username }} &bull; Registered {{ formatRelativeTime(user.createdAt) }}
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex align-center ga-2">
                  <v-select
                    v-model="approvalRoleSelections[user.id]"
                    :items="approvalRoleOptions"
                    item-title="name"
                    item-value="id"
                    label="Approve as"
                    density="compact"
                    hide-details
                    style="min-width: 180px"
                    class="approval-role-select"
                  >
                    <template #selection="{ item }">
                      <v-chip :color="item.raw.color" size="small" class="ml-1">{{
                        item.title
                      }}</v-chip>
                    </template>
                  </v-select>
                  <v-btn
                    color="success"
                    variant="tonal"
                    :loading="approvingUsers.has(user.id)"
                    @click="approveUser(user)"
                  >
                    Approve
                  </v-btn>
                  <v-btn
                    color="error"
                    variant="text"
                    icon
                    size="small"
                    @click="openRejectDialog(user)"
                  >
                    <v-icon>mdi-close</v-icon>
                    <v-tooltip activator="parent" location="top">Reject (deactivate)</v-tooltip>
                  </v-btn>
                </div>
              </template>
            </v-list-item>
          </v-list>
        </v-card>
      </v-tabs-window-item>

      <!-- USER MANAGEMENT TAB -->
      <v-tabs-window-item value="users">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="search"
                  prepend-icon="mdi-magnify"
                  label="Search users..."
                  single-line
                  hide-details
                  clearable
                  @update:model-value="debouncedSearch"
                />
              </v-col>
              <v-col cols="12" md="6" class="text-right">
                <span class="text-body-2 text-medium-emphasis"> {{ total }} user(s) found </span>
              </v-col>
            </v-row>
          </v-card-title>

          <v-data-table-server
            v-model:items-per-page="pageSize"
            v-model:page="page"
            :headers="userHeaders"
            :items="userList"
            :items-length="total"
            :loading="loading"
            @update:options="loadUsers"
          >
            <template #item.isActive="{ item }">
              <v-chip :color="item.isActive ? 'success' : 'error'" size="small">
                {{ item.isActive ? 'Active' : 'Inactive' }}
              </v-chip>
            </template>

            <template #item.roles="{ item }">
              <div class="d-flex flex-wrap ga-1">
                <v-chip v-for="role in item.roles" :key="role.id" size="small" :color="role.color">
                  {{ role.name }}
                </v-chip>
              </div>
            </template>

            <template #item.discord="{ item }">
              <div v-if="item.discord.connected" class="d-flex align-center">
                <v-icon color="success" size="small" class="mr-1">mdi-check-circle</v-icon>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <span v-bind="props" class="text-body-2 text-truncate" style="max-width: 80px">
                      {{ item.discord.discordUsername }}
                    </span>
                  </template>
                  <div>
                    <div>{{ item.discord.discordUsername }}</div>
                    <div class="text-caption">ID: {{ item.discord.discordId }}</div>
                  </div>
                </v-tooltip>
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  color="error"
                  class="ml-1"
                  :loading="disconnectingDiscord.has(item.id)"
                  @click="disconnectUserDiscord(item)"
                >
                  <v-icon size="small">mdi-link-off</v-icon>
                  <v-tooltip activator="parent" location="top">Disconnect Discord</v-tooltip>
                </v-btn>
              </div>
              <span v-else class="text-caption text-medium-emphasis">—</span>
            </template>

            <template #item.fioSync="{ item }">
              <div v-if="item.fioSync.fioUsername">
                <div class="text-body-2">{{ item.fioSync.fioUsername }}</div>
                <v-chip
                  v-if="item.fioSync.lastSyncedAt"
                  size="x-small"
                  :color="getSyncStatusColor(item.fioSync.lastSyncedAt)"
                >
                  {{ formatRelativeTime(item.fioSync.lastSyncedAt) }}
                </v-chip>
                <span v-else class="text-caption text-medium-emphasis">Never synced</span>
              </div>
              <span v-else class="text-caption text-medium-emphasis">Not configured</span>
            </template>

            <template #item.createdAt="{ item }">
              {{ formatDate(item.createdAt) }}
            </template>

            <template #item.actions="{ item }">
              <!-- Desktop: show buttons -->
              <div class="d-none d-sm-flex ga-1">
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      :disabled="!item.fioSync.fioUsername"
                      :loading="syncingUsers.has(item.id)"
                      @click="syncUserFio(item)"
                    >
                      <v-icon>mdi-sync</v-icon>
                    </v-btn>
                  </template>
                  {{ item.fioSync.fioUsername ? 'Sync FIO' : 'FIO not configured' }}
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn v-bind="props" icon size="small" @click="openEditDialog(item)">
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                  </template>
                  Edit user
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      color="error"
                      @click="openDeleteUserDialog(item)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </template>
                  Delete user
                </v-tooltip>
              </div>
              <!-- Mobile: show menu -->
              <v-menu>
                <template #activator="{ props }">
                  <v-btn v-bind="props" icon size="small" class="d-sm-none">
                    <v-icon>mdi-dots-vertical</v-icon>
                  </v-btn>
                </template>
                <v-list density="compact">
                  <v-list-item :disabled="!item.fioSync.fioUsername" @click="syncUserFio(item)">
                    <template #prepend>
                      <v-icon>mdi-sync</v-icon>
                    </template>
                    <v-list-item-title>Sync FIO</v-list-item-title>
                  </v-list-item>
                  <v-list-item @click="openEditDialog(item)">
                    <template #prepend>
                      <v-icon>mdi-pencil</v-icon>
                    </template>
                    <v-list-item-title>Edit user</v-list-item-title>
                  </v-list-item>
                  <v-list-item class="text-error" @click="openDeleteUserDialog(item)">
                    <template #prepend>
                      <v-icon color="error">mdi-delete</v-icon>
                    </template>
                    <v-list-item-title>Delete user</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-menu>
            </template>
          </v-data-table-server>
        </v-card>
      </v-tabs-window-item>

      <!-- PERMISSIONS TAB -->
      <v-tabs-window-item value="permissions">
        <v-card>
          <v-card-title>Role Permission Matrix</v-card-title>
          <v-card-text>
            <v-alert type="info" variant="tonal" class="mb-4" density="compact">
              This matrix shows which permissions are granted to each role. Click a cell to toggle
              the permission.
            </v-alert>

            <div v-if="loadingPermissions" class="text-center py-4">
              <v-progress-circular indeterminate />
            </div>

            <v-table v-else density="compact" class="permission-matrix">
              <thead>
                <tr>
                  <th class="text-left">Permission</th>
                  <th style="width: 28px"></th>
                  <th v-for="role in availableRoles" :key="role.id" class="text-center">
                    <v-chip :color="role.color" size="small">{{ role.name }}</v-chip>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="permission in permissionList" :key="permission.id">
                  <td>
                    <div class="font-weight-medium">{{ permission.name }}</div>
                    <div class="text-caption text-medium-emphasis">{{ permission.id }}</div>
                  </td>
                  <td class="px-0">
                    <v-tooltip v-if="permission.description" location="right">
                      <template #activator="{ props }">
                        <v-icon v-bind="props" size="small" class="text-medium-emphasis">
                          mdi-information-outline
                        </v-icon>
                      </template>
                      {{ permission.description }}
                    </v-tooltip>
                  </td>
                  <td v-for="role in availableRoles" :key="role.id" class="text-center">
                    <v-btn
                      icon
                      size="small"
                      variant="text"
                      :loading="isTogglingPermission(role.id, permission.id)"
                      @click="togglePermission(role.id, permission.id)"
                    >
                      <v-icon
                        :color="
                          getPermissionStatus(role.id, permission.id) === true
                            ? 'success'
                            : getPermissionStatus(role.id, permission.id) === false
                              ? 'error'
                              : 'grey'
                        "
                      >
                        {{
                          getPermissionStatus(role.id, permission.id) === true
                            ? 'mdi-check-circle'
                            : getPermissionStatus(role.id, permission.id) === false
                              ? 'mdi-close-circle'
                              : 'mdi-circle-outline'
                        }}
                      </v-icon>
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>

            <v-alert type="info" variant="tonal" class="mt-4" density="compact">
              <strong>Legend:</strong>
              <v-icon color="success" size="small" class="mx-1">mdi-check-circle</v-icon> Granted
              <v-icon color="error" size="small" class="mx-1">mdi-close-circle</v-icon> Denied
              <v-icon color="grey" size="small" class="mx-1">mdi-circle-outline</v-icon> Not set
              (inherits default: denied)
            </v-alert>
          </v-card-text>
        </v-card>
      </v-tabs-window-item>

      <!-- ROLES TAB -->
      <v-tabs-window-item value="roles">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col>Manage Roles</v-col>
              <v-col cols="auto">
                <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateRoleDialog">
                  Add Role
                </v-btn>
              </v-col>
            </v-row>
          </v-card-title>
          <v-card-text>
            <v-table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Color</th>
                  <th>Preview</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="role in availableRoles" :key="role.id">
                  <td class="font-weight-medium">{{ role.id }}</td>
                  <td>{{ role.name }}</td>
                  <td>{{ role.color }}</td>
                  <td>
                    <v-chip :color="role.color" size="small">{{ role.name }}</v-chip>
                  </td>
                  <td class="text-right">
                    <v-btn icon size="small" variant="text" @click="openEditRoleDialog(role)">
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                    <v-btn
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      @click="confirmDeleteRole(role)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>
          </v-card-text>
        </v-card>
      </v-tabs-window-item>

      <!-- DISCORD TAB -->
      <v-tabs-window-item value="discord">
        <v-row>
          <v-col cols="12" lg="6">
            <!-- OAuth Application Settings -->
            <v-card class="mb-4">
              <v-card-title>
                <v-icon class="mr-2">mdi-login</v-icon>
                OAuth Application
              </v-card-title>
              <v-card-text>
                <v-alert type="info" variant="tonal" class="mb-4" density="compact">
                  Used for user login and registration. Create an OAuth2 application in the
                  <a
                    href="https://discord.com/developers/applications"
                    target="_blank"
                    rel="noopener"
                  >
                    Discord Developer Portal</a
                  >
                  with <code>identify</code> and <code>guilds.members.read</code> scopes.
                </v-alert>

                <v-text-field
                  v-model="discordForm.clientId"
                  label="Client ID"
                  placeholder="Enter OAuth application client ID"
                  hint="Application ID from your OAuth app"
                  persistent-hint
                  class="mb-4"
                />

                <v-text-field
                  v-model="discordForm.clientSecret"
                  :type="showClientSecret ? 'text' : 'password'"
                  label="Client Secret"
                  :placeholder="
                    discordSettings?.hasClientSecret ? '••••••••••••••••' : 'Enter client secret'
                  "
                  :hint="
                    discordSettings?.hasClientSecret
                      ? 'Client secret is configured (enter new value to change)'
                      : 'OAuth2 client secret from your OAuth app'
                  "
                  persistent-hint
                  class="mb-4"
                  :append-inner-icon="showClientSecret ? 'mdi-eye-off' : 'mdi-eye'"
                  @click:append-inner="showClientSecret = !showClientSecret"
                />

                <v-text-field
                  v-model="discordForm.redirectUri"
                  label="Redirect URI"
                  placeholder="https://your-domain.com/discord/callback"
                  hint="Must match exactly in Discord Developer Portal (e.g., https://kawakawa.cx/discord/callback)"
                  persistent-hint
                  class="mb-4"
                />

                <v-btn
                  color="primary"
                  :loading="savingDiscordSettings"
                  :disabled="!hasOAuthSettingsChanges"
                  @click="saveOAuthSettings"
                >
                  Save OAuth Settings
                </v-btn>
              </v-card-text>
            </v-card>

            <!-- Bot Application Settings -->
            <v-card>
              <v-card-title>
                <v-icon class="mr-2">mdi-robot</v-icon>
                Bot Application
              </v-card-title>
              <v-card-text>
                <v-alert type="info" variant="tonal" class="mb-4" density="compact">
                  Used for server integration features like role syncing and auto-approval. Add a
                  Bot to your application and invite it to your server.
                </v-alert>

                <v-text-field
                  v-model="discordForm.botToken"
                  :type="showBotToken ? 'text' : 'password'"
                  label="Bot Token"
                  :placeholder="
                    discordSettings?.hasBotToken ? '••••••••••••••••' : 'Enter bot token'
                  "
                  :hint="
                    discordSettings?.hasBotToken
                      ? 'Bot token is configured (enter new value to change)'
                      : 'Token from your Bot application'
                  "
                  persistent-hint
                  class="mb-4"
                  :append-inner-icon="showBotToken ? 'mdi-eye-off' : 'mdi-eye'"
                  @click:append-inner="showBotToken = !showBotToken"
                />

                <v-text-field
                  v-model="discordForm.guildId"
                  label="Guild ID (Server ID)"
                  placeholder="Enter Discord server ID"
                  hint="Right-click on your server and 'Copy Server ID' (enable Developer Mode first)"
                  persistent-hint
                  class="mb-4"
                />

                <div class="d-flex align-center ga-2 mb-4">
                  <v-btn
                    color="secondary"
                    variant="outlined"
                    :loading="testingConnection"
                    :disabled="!discordSettings?.hasBotToken || !discordForm.guildId"
                    prepend-icon="mdi-connection"
                    @click="testDiscordConnection"
                  >
                    Test Connection
                  </v-btn>
                  <v-chip
                    v-if="discordSettings?.guildName"
                    color="success"
                    prepend-icon="mdi-check-circle"
                  >
                    {{ discordSettings.guildName }}
                  </v-chip>
                </div>

                <v-switch
                  v-model="discordForm.autoApprovalEnabled"
                  label="Enable Auto-Approval"
                  color="success"
                  hint="Automatically approve users based on Discord role mappings"
                  persistent-hint
                  class="mb-4"
                />

                <v-btn
                  color="primary"
                  :loading="savingDiscordSettings"
                  :disabled="!hasBotSettingsChanges"
                  @click="saveBotSettings"
                >
                  Save Bot Settings
                </v-btn>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" lg="6">
            <!-- Role Mappings -->
            <v-card>
              <v-card-title>
                <v-row align="center" no-gutters>
                  <v-col>
                    <v-icon class="mr-2">mdi-account-convert</v-icon>
                    Role Mappings
                  </v-col>
                  <v-col cols="auto">
                    <v-btn
                      color="primary"
                      size="small"
                      prepend-icon="mdi-plus"
                      :disabled="!discordSettings?.guildId"
                      @click="openCreateMappingDialog"
                    >
                      Add Mapping
                    </v-btn>
                  </v-col>
                </v-row>
              </v-card-title>
              <v-card-text>
                <v-alert
                  v-if="!discordSettings?.guildId"
                  type="warning"
                  variant="tonal"
                  class="mb-4"
                  density="compact"
                >
                  Configure and test your Discord server connection first to enable role mappings.
                </v-alert>

                <v-alert type="info" variant="tonal" class="mb-4" density="compact">
                  Map Discord roles to application roles for auto-approval. Higher priority mappings
                  are checked first.
                </v-alert>

                <div v-if="loadingRoleMappings" class="text-center py-4">
                  <v-progress-circular indeterminate />
                </div>

                <v-table v-else-if="discordRoleMappings.length > 0" density="compact">
                  <thead>
                    <tr>
                      <th>Discord Role</th>
                      <th>App Role</th>
                      <th>Priority</th>
                      <th class="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="mapping in discordRoleMappings" :key="mapping.id">
                      <td>
                        <v-chip size="small" color="indigo">{{ mapping.discordRoleName }}</v-chip>
                      </td>
                      <td>
                        <v-chip size="small" :color="getAppRoleColor(mapping.appRoleId)">
                          {{ mapping.appRoleName }}
                        </v-chip>
                      </td>
                      <td>{{ mapping.priority }}</td>
                      <td class="text-right">
                        <v-btn
                          icon
                          size="small"
                          variant="text"
                          @click="openEditMappingDialog(mapping)"
                        >
                          <v-icon>mdi-pencil</v-icon>
                        </v-btn>
                        <v-btn
                          icon
                          size="small"
                          variant="text"
                          color="error"
                          @click="confirmDeleteMapping(mapping)"
                        >
                          <v-icon>mdi-delete</v-icon>
                        </v-btn>
                      </td>
                    </tr>
                  </tbody>
                </v-table>

                <v-alert v-else type="info" variant="tonal" density="compact">
                  No role mappings configured yet. Add mappings to enable auto-approval.
                </v-alert>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>
      </v-tabs-window-item>

      <!-- PRICE LISTS TAB -->
      <v-tabs-window-item value="priceLists">
        <!-- Price Lists Management -->
        <v-card class="mb-4">
          <v-card-title>
            <v-row align="center" no-gutters>
              <v-col>
                <v-icon class="mr-2">mdi-format-list-bulleted</v-icon>
                Price Lists
              </v-col>
              <v-col cols="auto">
                <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreatePriceListDialog">
                  Add Price List
                </v-btn>
              </v-col>
            </v-row>
          </v-card-title>
          <v-card-text>
            <div v-if="loadingPriceLists" class="text-center py-4">
              <v-progress-circular indeterminate />
            </div>

            <v-expansion-panels v-else-if="priceLists.length > 0" variant="accordion">
              <v-expansion-panel v-for="priceList in priceLists" :key="priceList.code">
                <v-expansion-panel-title>
                  <div class="d-flex align-center flex-grow-1">
                    <v-chip
                      :color="priceList.type === 'fio' ? 'blue' : 'green'"
                      size="small"
                      class="mr-3"
                    >
                      {{ priceList.type.toUpperCase() }}
                    </v-chip>
                    <div>
                      <strong>{{ priceList.code }}</strong>
                      <span class="text-medium-emphasis ml-2">{{ priceList.name }}</span>
                    </div>
                    <v-spacer />
                    <div class="d-flex align-center ga-2 mr-4">
                      <v-chip size="x-small" color="grey">
                        {{ priceList.priceCount || 0 }} prices
                      </v-chip>
                      <v-chip size="x-small" color="grey">
                        {{ priceList.importConfigCount || 0 }} imports
                      </v-chip>
                      <v-chip size="x-small" :color="priceList.isActive ? 'success' : 'error'">
                        {{ priceList.isActive ? 'Active' : 'Inactive' }}
                      </v-chip>
                    </div>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-row>
                    <v-col cols="12" md="6">
                      <p v-if="priceList.description" class="text-body-2 text-medium-emphasis mb-2">
                        {{ priceList.description }}
                      </p>
                      <div class="text-body-2">
                        <strong>Currency:</strong> {{ priceList.currency }}<br />
                        <strong>Default Location:</strong>
                        {{ priceList.defaultLocationName || priceList.defaultLocationId || 'None' }}
                      </div>
                    </v-col>
                    <v-col cols="12" md="6" class="text-md-right">
                      <v-btn
                        v-if="priceList.type === 'fio'"
                        variant="outlined"
                        color="primary"
                        size="small"
                        class="mr-2"
                        :loading="syncingFioPriceLists.has(priceList.code)"
                        @click.stop="syncFioPriceList(priceList)"
                      >
                        <v-icon start>mdi-sync</v-icon>
                        Sync from FIO
                      </v-btn>
                      <v-btn
                        variant="outlined"
                        size="small"
                        class="mr-2"
                        @click.stop="openEditPriceListDialog(priceList)"
                      >
                        <v-icon start>mdi-pencil</v-icon>
                        Edit
                      </v-btn>
                      <v-btn
                        v-if="priceList.type !== 'fio'"
                        variant="outlined"
                        color="error"
                        size="small"
                        @click.stop="confirmDeletePriceList(priceList)"
                      >
                        <v-icon start>mdi-delete</v-icon>
                        Delete
                      </v-btn>
                    </v-col>
                  </v-row>

                  <!-- Import Configs for this price list -->
                  <v-divider class="my-4" />
                  <div class="d-flex align-center mb-2">
                    <h4 class="text-subtitle-2">Import Configurations</h4>
                    <v-spacer />
                    <v-btn
                      size="small"
                      variant="text"
                      color="primary"
                      @click.stop="openCreateImportConfigDialog(priceList.code)"
                    >
                      <v-icon start>mdi-plus</v-icon>
                      Add Import
                    </v-btn>
                  </div>

                  <v-table
                    v-if="getImportConfigsForPriceList(priceList.code).length > 0"
                    density="compact"
                  >
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Source</th>
                        <th>Format</th>
                        <th class="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="config in getImportConfigsForPriceList(priceList.code)"
                        :key="config.id"
                      >
                        <td>{{ config.name }}</td>
                        <td>
                          <v-chip size="x-small">{{ config.sourceType }}</v-chip>
                        </td>
                        <td>
                          <v-chip
                            size="x-small"
                            :color="config.format === 'pivot' ? 'purple' : 'teal'"
                          >
                            {{ config.format }}
                          </v-chip>
                        </td>
                        <td class="text-right">
                          <v-btn
                            icon
                            size="x-small"
                            variant="text"
                            :loading="syncingConfigs.has(config.id)"
                            :disabled="!config.sheetsUrl"
                            @click.stop="syncImportConfig(config)"
                          >
                            <v-icon>mdi-sync</v-icon>
                            <v-tooltip activator="parent" location="top">Sync Now</v-tooltip>
                          </v-btn>
                          <v-btn
                            icon
                            size="x-small"
                            variant="text"
                            @click.stop="openEditImportConfigDialog(config)"
                          >
                            <v-icon>mdi-pencil</v-icon>
                            <v-tooltip activator="parent" location="top">Edit</v-tooltip>
                          </v-btn>
                          <v-btn
                            icon
                            size="x-small"
                            variant="text"
                            color="error"
                            @click.stop="confirmDeleteImportConfig(config)"
                          >
                            <v-icon>mdi-delete</v-icon>
                            <v-tooltip activator="parent" location="top">Delete</v-tooltip>
                          </v-btn>
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                  <p v-else class="text-body-2 text-medium-emphasis">
                    No import configurations. Add one to enable automated price imports.
                  </p>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <v-alert v-else type="info" variant="tonal">
              No price lists configured. Click "Add Price List" to create one.
            </v-alert>
          </v-card-text>
        </v-card>

        <v-row>
          <v-col cols="12" lg="6">
            <!-- FIO API Settings -->
            <v-card class="mb-4">
              <v-card-title>
                <v-icon class="mr-2">mdi-api</v-icon>
                FIO API Settings
              </v-card-title>
              <v-card-text>
                <v-alert type="info" variant="tonal" class="mb-4" density="compact">
                  Configure the FIO REST API endpoint used for syncing exchange prices and other
                  game data.
                </v-alert>

                <v-text-field
                  v-model="priceSettingsForm.fioBaseUrl"
                  label="FIO Base URL"
                  placeholder="https://rest.fnar.net"
                  hint="The base URL for the FIO REST API"
                  persistent-hint
                  class="mb-4"
                />

                <v-select
                  v-model="priceSettingsForm.fioPriceField"
                  :items="fioPriceFieldOptions"
                  label="Price Field"
                  hint="Which FIO price field to use when syncing exchange prices"
                  persistent-hint
                  class="mb-4"
                />

                <v-btn
                  color="primary"
                  :loading="savingFioSettings"
                  :disabled="!hasFioSettingsChanges"
                  @click="saveFioSettings"
                >
                  Save FIO Settings
                </v-btn>
              </v-card-text>
            </v-card>
          </v-col>

          <v-col cols="12" lg="6">
            <!-- Google Sheets API Settings -->
            <v-card>
              <v-card-title>
                <v-icon class="mr-2">mdi-google-spreadsheet</v-icon>
                Google Sheets API
              </v-card-title>
              <v-card-text>
                <v-alert type="info" variant="tonal" class="mb-4" density="compact">
                  Configure Google Sheets API access for importing price data from spreadsheets.
                </v-alert>

                <v-text-field
                  v-model="priceSettingsForm.googleApiKey"
                  :type="showGoogleApiKey ? 'text' : 'password'"
                  label="Google API Key"
                  :placeholder="
                    priceSettings?.hasGoogleSheetsApiKey
                      ? '••••••••••••••••'
                      : 'Enter Google API key'
                  "
                  :hint="
                    priceSettings?.hasGoogleSheetsApiKey
                      ? 'API key is configured (enter new value to change)'
                      : 'API key with Google Sheets API access'
                  "
                  persistent-hint
                  class="mb-4"
                  :append-inner-icon="showGoogleApiKey ? 'mdi-eye-off' : 'mdi-eye'"
                  @click:append-inner="showGoogleApiKey = !showGoogleApiKey"
                />

                <v-btn
                  color="primary"
                  :loading="savingGoogleSettings"
                  :disabled="!priceSettingsForm.googleApiKey"
                  @click="saveGoogleSettings"
                >
                  Save Google API Key
                </v-btn>
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Price Adjustments Management -->
        <v-card class="mt-4">
          <v-card-title>
            <v-row align="center" no-gutters>
              <v-col>
                <v-icon class="mr-2">mdi-tune</v-icon>
                Price Adjustments
              </v-col>
              <v-col cols="auto">
                <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateAdjustmentDialog">
                  Add Adjustment
                </v-btn>
              </v-col>
            </v-row>
          </v-card-title>
          <v-card-text>
            <v-alert type="info" variant="tonal" class="mb-4" density="compact">
              Price adjustments allow you to apply percentage or fixed value changes to prices. They
              can be scoped to specific price lists, commodities, or locations. Global adjustments
              (no filters) apply to all prices.
            </v-alert>

            <div v-if="loadingAdjustments" class="text-center py-4">
              <v-progress-circular indeterminate />
            </div>

            <v-table v-else-if="priceAdjustments.length > 0" density="compact">
              <thead>
                <tr>
                  <th>Scope</th>
                  <th>Type</th>
                  <th>Value</th>
                  <th>Priority</th>
                  <th>Description</th>
                  <th>Status</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="adjustment in priceAdjustments" :key="adjustment.id">
                  <td>
                    <span class="text-body-2">{{ getAdjustmentScope(adjustment) }}</span>
                  </td>
                  <td>
                    <v-chip
                      size="x-small"
                      :color="adjustment.adjustmentType === 'percentage' ? 'blue' : 'purple'"
                    >
                      {{ adjustment.adjustmentType }}
                    </v-chip>
                  </td>
                  <td>
                    <span
                      :class="
                        parseFloat(adjustment.adjustmentValue) >= 0 ? 'text-success' : 'text-error'
                      "
                    >
                      {{ formatAdjustmentValue(adjustment) }}
                    </span>
                  </td>
                  <td>{{ adjustment.priority }}</td>
                  <td>
                    <span class="text-body-2 text-medium-emphasis">
                      {{ adjustment.description || '-' }}
                    </span>
                  </td>
                  <td>
                    <v-chip size="x-small" :color="adjustment.isActive ? 'success' : 'error'">
                      {{ adjustment.isActive ? 'Active' : 'Inactive' }}
                    </v-chip>
                  </td>
                  <td class="text-right">
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      @click="openEditAdjustmentDialog(adjustment)"
                    >
                      <v-icon>mdi-pencil</v-icon>
                      <v-tooltip activator="parent" location="top">Edit</v-tooltip>
                    </v-btn>
                    <v-btn
                      icon
                      size="x-small"
                      variant="text"
                      color="error"
                      @click="confirmDeleteAdjustment(adjustment)"
                    >
                      <v-icon>mdi-delete</v-icon>
                      <v-tooltip activator="parent" location="top">Delete</v-tooltip>
                    </v-btn>
                  </td>
                </tr>
              </tbody>
            </v-table>

            <v-alert v-else type="info" variant="tonal">
              No price adjustments configured. Click "Add Adjustment" to create one.
            </v-alert>
          </v-card-text>
        </v-card>
      </v-tabs-window-item>

      <!-- GLOBAL DEFAULTS TAB -->
      <v-tabs-window-item value="globalDefaults">
        <v-card>
          <v-card-title>
            <v-row align="center" no-gutters>
              <v-col>
                <v-icon class="mr-2">mdi-cog-outline</v-icon>
                Global Default Settings
              </v-col>
              <v-col cols="auto">
                <v-btn
                  color="primary"
                  variant="text"
                  prepend-icon="mdi-refresh"
                  :loading="loadingGlobalDefaults"
                  @click="loadGlobalDefaults"
                >
                  Refresh
                </v-btn>
              </v-col>
            </v-row>
          </v-card-title>
          <v-card-text>
            <v-alert type="info" variant="tonal" class="mb-4" density="compact">
              Configure default values for user settings. These defaults apply to all users who have
              not set their own preference. User-specific settings like FIO credentials and
              favorites cannot be configured globally.
            </v-alert>

            <div v-if="loadingGlobalDefaults" class="text-center py-4">
              <v-progress-circular indeterminate />
            </div>

            <v-expansion-panels v-else-if="globalDefaults.length > 0" v-model="openDefaultPanels">
              <v-expansion-panel
                v-for="category in globalDefaultCategories"
                :key="category.id"
                :value="category.id"
              >
                <v-expansion-panel-title>
                  <div class="d-flex align-center flex-grow-1">
                    <strong>{{ category.label }}</strong>
                    <span class="text-medium-emphasis ml-2">{{ category.description }}</span>
                    <v-spacer />
                    <v-chip
                      v-if="getOverrideCount(category.id) > 0"
                      size="x-small"
                      color="primary"
                      class="mr-2"
                    >
                      {{ getOverrideCount(category.id) }} override{{
                        getOverrideCount(category.id) > 1 ? 's' : ''
                      }}
                    </v-chip>
                  </div>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <v-list density="compact">
                    <v-list-item
                      v-for="setting in getSettingsForCategory(category.id)"
                      :key="setting.key"
                      class="px-0"
                    >
                      <v-row align="center" no-gutters>
                        <v-col cols="12" md="4">
                          <div class="font-weight-medium">{{ setting.definition.label }}</div>
                          <div class="text-caption text-medium-emphasis">
                            {{ setting.definition.description }}
                          </div>
                        </v-col>
                        <v-col cols="12" md="5" class="py-2 py-md-0">
                          <!-- Timezone: autocomplete -->
                          <v-autocomplete
                            v-if="setting.key === 'general.timezone'"
                            :model-value="
                              (globalDefaultsForm[setting.key] ??
                                setting.effectiveDefault) as string
                            "
                            :items="timezoneOptions"
                            density="compact"
                            hide-details
                            variant="outlined"
                            prepend-inner-icon="mdi-clock-outline"
                            :loading="savingGlobalDefault === setting.key"
                            @update:model-value="saveGlobalDefault(setting.key, $event)"
                          />
                          <!-- Location display mode: select with descriptive options -->
                          <v-select
                            v-else-if="setting.key === 'display.locationDisplayMode'"
                            :model-value="
                              (globalDefaultsForm[setting.key] ??
                                setting.effectiveDefault) as string
                            "
                            :items="locationDisplayModes"
                            density="compact"
                            hide-details
                            variant="outlined"
                            prepend-inner-icon="mdi-map-marker"
                            :loading="savingGlobalDefault === setting.key"
                            @update:model-value="saveGlobalDefault(setting.key, $event)"
                          />
                          <!-- Commodity display mode: select with descriptive options -->
                          <v-select
                            v-else-if="setting.key === 'display.commodityDisplayMode'"
                            :model-value="
                              (globalDefaultsForm[setting.key] ??
                                setting.effectiveDefault) as string
                            "
                            :items="commodityDisplayModes"
                            density="compact"
                            hide-details
                            variant="outlined"
                            prepend-inner-icon="mdi-package-variant"
                            :loading="savingGlobalDefault === setting.key"
                            @update:model-value="saveGlobalDefault(setting.key, $event)"
                          />
                          <!-- Preferred currency: select -->
                          <v-select
                            v-else-if="setting.key === 'market.preferredCurrency'"
                            :model-value="
                              (globalDefaultsForm[setting.key] ??
                                setting.effectiveDefault) as string
                            "
                            :items="currencyOptions"
                            density="compact"
                            hide-details
                            variant="outlined"
                            prepend-inner-icon="mdi-currency-usd"
                            :loading="savingGlobalDefault === setting.key"
                            @update:model-value="saveGlobalDefault(setting.key, $event)"
                          />
                          <!-- Default price list: autocomplete with clearable -->
                          <v-autocomplete
                            v-else-if="setting.key === 'market.defaultPriceList'"
                            :model-value="
                              (globalDefaultsForm[setting.key] as string | null) ?? null
                            "
                            :items="globalDefaultsPriceLists"
                            density="compact"
                            hide-details
                            variant="outlined"
                            prepend-inner-icon="mdi-clipboard-list"
                            clearable
                            :loading="
                              savingGlobalDefault === setting.key || loadingGlobalDefaultsPriceLists
                            "
                            @update:model-value="saveGlobalDefault(setting.key, $event)"
                          />
                          <!-- Boolean type -->
                          <v-switch
                            v-else-if="setting.definition.type === 'boolean'"
                            :model-value="
                              (globalDefaultsForm[setting.key] ??
                                setting.effectiveDefault) as boolean
                            "
                            density="compact"
                            hide-details
                            color="primary"
                            :loading="savingGlobalDefault === setting.key"
                            @update:model-value="saveGlobalDefault(setting.key, $event)"
                          />
                          <!-- Enum type (generic fallback) -->
                          <v-select
                            v-else-if="setting.definition.type === 'enum'"
                            :model-value="
                              (globalDefaultsForm[setting.key] ??
                                setting.effectiveDefault) as string
                            "
                            :items="setting.definition.enumOptions || []"
                            density="compact"
                            hide-details
                            variant="outlined"
                            :loading="savingGlobalDefault === setting.key"
                            @update:model-value="saveGlobalDefault(setting.key, $event)"
                          />
                          <!-- String type (generic fallback) -->
                          <v-text-field
                            v-else-if="setting.definition.type === 'string'"
                            :model-value="
                              (globalDefaultsForm[setting.key] ??
                                setting.effectiveDefault) as string
                            "
                            density="compact"
                            hide-details
                            variant="outlined"
                            :loading="savingGlobalDefault === setting.key"
                            @blur="
                              saveGlobalDefault(
                                setting.key,
                                ($event.target as HTMLInputElement).value
                              )
                            "
                            @keyup.enter="
                              saveGlobalDefault(
                                setting.key,
                                ($event.target as HTMLInputElement).value
                              )
                            "
                          />
                        </v-col>
                        <v-col cols="12" md="3" class="text-md-right">
                          <div
                            v-if="setting.adminDefault !== null"
                            class="d-flex align-center justify-end"
                          >
                            <v-chip size="x-small" color="primary" class="mr-2">
                              Customized
                            </v-chip>
                            <v-btn
                              size="small"
                              variant="text"
                              color="error"
                              :loading="resettingGlobalDefault === setting.key"
                              @click="resetGlobalDefault(setting.key)"
                            >
                              Reset
                            </v-btn>
                          </div>
                          <div v-else class="text-caption text-medium-emphasis">
                            Using code default
                          </div>
                        </v-col>
                      </v-row>
                    </v-list-item>
                  </v-list>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>

            <v-alert v-else type="info" variant="tonal">
              No configurable settings found. This may indicate a loading error.
            </v-alert>
          </v-card-text>
        </v-card>
      </v-tabs-window-item>
    </v-tabs-window>

    <!-- Edit User Dialog -->
    <v-dialog v-model="editDialog" max-width="500">
      <v-card v-if="editingUser">
        <v-card-title>Edit User: {{ editingUser.username }}</v-card-title>
        <v-card-text>
          <v-form>
            <v-text-field
              :model-value="editingUser.displayName"
              label="Display Name"
              readonly
              disabled
            />
            <v-text-field
              :model-value="editingUser.email || '(none)'"
              label="Email"
              readonly
              disabled
            />
            <v-switch
              v-model="editForm.isActive"
              label="Account Active"
              color="success"
              hint="Inactive accounts cannot log in"
              persistent-hint
            />
            <v-select
              v-model="editForm.roles"
              :items="availableRoles"
              item-title="name"
              item-value="id"
              label="Roles"
              multiple
              chips
              closable-chips
            >
              <template #chip="{ item }">
                <v-chip :color="item.raw.color" size="small" closable>
                  {{ item.title }}
                </v-chip>
              </template>
            </v-select>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-btn
            color="warning"
            variant="outlined"
            :loading="generatingResetLink"
            @click="generateResetLink"
          >
            Generate Reset Link
          </v-btn>
          <v-spacer />
          <v-btn text @click="editDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveUser"> Save Changes </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Password Reset Link Dialog -->
    <v-dialog v-model="resetLinkDialog" max-width="600">
      <v-card>
        <v-card-title>Password Reset Link Generated</v-card-title>
        <v-card-text>
          <v-alert type="info" variant="tonal" class="mb-4">
            Share this link with <strong>{{ resetLinkData?.username }}</strong> to allow them to
            reset their password. The password will NOT be changed until they use this link.
          </v-alert>

          <v-text-field
            :model-value="resetLinkUrl"
            label="Reset Link"
            readonly
            variant="outlined"
            append-inner-icon="mdi-content-copy"
            @click:append-inner="copyResetLink"
          />

          <v-alert type="warning" variant="tonal" density="compact">
            This link expires on {{ formatDateTime(resetLinkData?.expiresAt) }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="resetLinkDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Create/Edit Role Dialog -->
    <v-dialog v-model="roleDialog" max-width="500">
      <v-card>
        <v-card-title>{{ editingRole ? 'Edit Role' : 'Create Role' }}</v-card-title>
        <v-card-text>
          <v-form ref="roleFormRef">
            <v-text-field
              v-model="roleForm.id"
              label="Role ID"
              :disabled="!!editingRole"
              :rules="[v => !!v || 'ID is required']"
              hint="Unique identifier (e.g., 'moderator')"
              persistent-hint
            />
            <v-text-field
              v-model="roleForm.name"
              label="Display Name"
              :rules="[v => !!v || 'Name is required']"
              class="mt-4"
            />
            <v-select
              v-model="roleForm.color"
              :items="vuetifyColors"
              label="Color"
              :rules="[v => !!v || 'Color is required']"
              class="mt-4"
            >
              <template #selection="{ item }">
                <v-chip :color="item.value" size="small">{{ item.title }}</v-chip>
              </template>
              <template #item="{ item, props }">
                <v-list-item v-bind="props">
                  <template #prepend>
                    <v-chip :color="item.value" size="small" class="mr-2">{{ item.title }}</v-chip>
                  </template>
                </v-list-item>
              </template>
            </v-select>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="roleDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="savingRole" @click="saveRole">
            {{ editingRole ? 'Update' : 'Create' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Role Confirmation Dialog -->
    <v-dialog v-model="deleteRoleDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Role</v-card-title>
        <v-card-text>
          Are you sure you want to delete the role <strong>{{ deletingRole?.name }}</strong
          >? This action cannot be undone.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteRoleDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingRoleLoading" @click="deleteRole"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Reject User Dialog -->
    <v-dialog v-model="rejectDialog" max-width="400">
      <v-card>
        <v-card-title>Reject Registration</v-card-title>
        <v-card-text>
          Are you sure you want to reject <strong>{{ rejectingUser?.displayName }}</strong
          >? This will deactivate their account.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="rejectDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="rejectingLoading" @click="rejectUser"> Reject </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete User Dialog -->
    <v-dialog v-model="deleteUserDialog" max-width="500">
      <v-card>
        <v-card-title class="text-error">Delete User</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" class="mb-4">
            This action is <strong>permanent</strong> and cannot be undone.
          </v-alert>
          <p>
            Are you sure you want to delete <strong>{{ deletingUser?.displayName }}</strong> (@{{
              deletingUser?.username
            }})?
          </p>
          <p class="text-body-2 text-medium-emphasis mt-2">This will permanently delete:</p>
          <ul class="text-body-2 text-medium-emphasis ml-4">
            <li>User account and profile</li>
            <li>All sell and buy orders</li>
            <li>FIO inventory data</li>
            <li>Discord connection</li>
            <li>All other associated data</li>
          </ul>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteUserDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingUserLoading" @click="deleteUser">
            Delete Permanently
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Create/Edit Role Mapping Dialog -->
    <v-dialog v-model="mappingDialog" max-width="500">
      <v-card>
        <v-card-title>{{
          editingMapping ? 'Edit Role Mapping' : 'Create Role Mapping'
        }}</v-card-title>
        <v-card-text>
          <v-select
            v-model="mappingForm.discordRoleId"
            :items="discordGuildRoles"
            item-title="name"
            item-value="id"
            label="Discord Role"
            :loading="loadingDiscordRoles"
            :disabled="loadingDiscordRoles"
            :rules="[v => !!v || 'Discord role is required']"
            class="mb-4"
          >
            <template #item="{ item, props }">
              <v-list-item v-bind="props">
                <template #prepend>
                  <div
                    class="mr-2"
                    style="width: 12px; height: 12px; border-radius: 50%"
                    :style="{ backgroundColor: getDiscordRoleColor(item.raw.color) }"
                  />
                </template>
              </v-list-item>
            </template>
          </v-select>

          <v-select
            v-model="mappingForm.appRoleId"
            :items="approvalRoleOptions"
            item-title="name"
            item-value="id"
            label="Application Role"
            :rules="[v => !!v || 'App role is required']"
            class="mb-4"
          >
            <template #selection="{ item }">
              <v-chip :color="item.raw.color" size="small">{{ item.title }}</v-chip>
            </template>
          </v-select>

          <v-text-field
            v-model.number="mappingForm.priority"
            type="number"
            label="Priority"
            hint="Higher priority mappings are checked first (default: 0)"
            persistent-hint
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="mappingDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="savingMapping" @click="saveMapping">
            {{ editingMapping ? 'Update' : 'Create' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Role Mapping Confirmation Dialog -->
    <v-dialog v-model="deleteMappingDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Role Mapping</v-card-title>
        <v-card-text>
          Are you sure you want to delete the mapping from
          <strong>{{ deletingMapping?.discordRoleName }}</strong> to
          <strong>{{ deletingMapping?.appRoleName }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteMappingDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingMappingLoading" @click="deleteMapping">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Price List Dialog -->
    <PriceListDialog
      v-model="priceListDialog"
      :price-list="editingPriceList"
      @saved="onPriceListSaved"
    />

    <!-- Import Config Dialog -->
    <ImportConfigDialog
      v-model="importConfigDialog"
      :config="editingImportConfig"
      :price-list-code="newImportConfigPriceList"
      @saved="onImportConfigSaved"
    />

    <!-- Delete Price List Confirmation Dialog -->
    <v-dialog v-model="deletePriceListDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Price List</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" class="mb-4">
            This will permanently delete the price list and all associated prices.
          </v-alert>
          Are you sure you want to delete <strong>{{ deletingPriceList?.code }}</strong> ({{
            deletingPriceList?.name
          }})?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deletePriceListDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingPriceListLoading" @click="deletePriceListConfirm">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Import Config Confirmation Dialog -->
    <v-dialog v-model="deleteImportConfigDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Import Configuration</v-card-title>
        <v-card-text>
          Are you sure you want to delete the import configuration
          <strong>{{ deletingImportConfig?.name }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteImportConfigDialog = false">Cancel</v-btn>
          <v-btn
            color="error"
            :loading="deletingImportConfigLoading"
            @click="deleteImportConfigConfirm"
          >
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Create/Edit Price Adjustment Dialog -->
    <v-dialog
      v-model="adjustmentDialog"
      max-width="600"
      :persistent="adjustmentDialogBehavior.persistent.value"
      :no-click-animation="adjustmentDialogBehavior.noClickAnimation"
    >
      <v-card>
        <v-card-title>
          {{ editingAdjustment ? 'Edit Price Adjustment' : 'Create Price Adjustment' }}
        </v-card-title>
        <v-card-text>
          <v-row>
            <v-col cols="12" md="6">
              <v-select
                v-model="adjustmentForm.priceListCode"
                :items="[
                  { title: 'All Price Lists', value: null },
                  ...priceLists.map(pl => ({ title: `${pl.code} - ${pl.name}`, value: pl.code })),
                ]"
                item-title="title"
                item-value="value"
                label="Price List"
                hint="Leave empty to apply to all price lists"
                persistent-hint
                clearable
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="adjustmentForm.commodityTicker"
                label="Commodity Ticker"
                hint="e.g., DW, RAT, H2O (leave empty for all)"
                persistent-hint
                clearable
              />
            </v-col>
          </v-row>

          <v-row>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="adjustmentForm.locationId"
                label="Location ID"
                hint="e.g., BEN, MON (leave empty for all)"
                persistent-hint
                clearable
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="adjustmentForm.priority"
                type="number"
                label="Priority"
                hint="Higher priority adjustments applied first"
                persistent-hint
              />
            </v-col>
          </v-row>

          <v-row>
            <v-col cols="12" md="6">
              <v-select
                v-model="adjustmentForm.adjustmentType"
                :items="[
                  { title: 'Percentage (%)', value: 'percentage' },
                  { title: 'Fixed Amount', value: 'fixed' },
                ]"
                item-title="title"
                item-value="value"
                label="Adjustment Type"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model.number="adjustmentForm.adjustmentValue"
                type="number"
                step="0.01"
                label="Value"
                :hint="
                  adjustmentForm.adjustmentType === 'percentage'
                    ? 'e.g., 10 for +10%, -5 for -5%'
                    : 'Fixed amount to add/subtract'
                "
                persistent-hint
              />
            </v-col>
          </v-row>

          <v-text-field
            v-model="adjustmentForm.description"
            label="Description"
            hint="Optional note explaining this adjustment"
            persistent-hint
            class="mt-4"
          />

          <v-switch
            v-model="adjustmentForm.isActive"
            label="Active"
            color="success"
            hint="Inactive adjustments are not applied to prices"
            persistent-hint
            class="mt-4"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="adjustmentDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="savingAdjustment" @click="saveAdjustment">
            {{ editingAdjustment ? 'Update' : 'Create' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Price Adjustment Confirmation Dialog -->
    <v-dialog v-model="deleteAdjustmentDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Price Adjustment</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" class="mb-4">
            This will permanently delete this price adjustment.
          </v-alert>
          Are you sure you want to delete this adjustment?
          <div v-if="deletingAdjustment" class="mt-2">
            <strong>{{ getAdjustmentScope(deletingAdjustment) }}</strong>
            <br />
            {{ formatAdjustmentValue(deletingAdjustment) }}
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteAdjustmentDialog = false">Cancel</v-btn>
          <v-btn
            color="error"
            :loading="deletingAdjustmentLoading"
            @click="deleteAdjustmentConfirm"
          >
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useUrlTab, useDialogBehavior } from '../composables'
import type { Role } from '../types'
import type {
  DiscordSettings,
  DiscordRoleMapping,
  DiscordRole,
  GlobalDefaultSetting,
} from '@kawakawa/types'
import { api } from '../services/api'
import type {
  PriceSettingsResponse,
  FioPriceField,
  PriceListDefinition,
  ImportConfigResponse,
  PriceAdjustmentResponse,
  CreatePriceAdjustmentRequest,
  UpdatePriceAdjustmentRequest,
  AdjustmentType,
} from '../services/api'
import PriceListDialog from '../components/PriceListDialog.vue'
import ImportConfigDialog from '../components/ImportConfigDialog.vue'

interface FioSyncInfo {
  fioUsername: string | null
  lastSyncedAt: string | null
}

interface DiscordInfo {
  connected: boolean
  discordUsername: string | null
  discordId: string | null
  connectedAt: string | null
}

interface AdminUser {
  id: number
  username: string
  email: string | null
  displayName: string
  isActive: boolean
  roles: Role[]
  fioSync: FioSyncInfo
  discord: DiscordInfo
  createdAt: string
}

interface PasswordResetLinkData {
  token: string
  expiresAt: string
  username: string
}

interface Permission {
  id: string
  name: string
  description: string | null
}

interface RolePermissionWithDetails {
  id: number
  roleId: string
  roleName: string
  roleColor: string
  permissionId: string
  permissionName: string
  allowed: boolean
}

const ADMIN_TABS = [
  'approvals',
  'users',
  'permissions',
  'roles',
  'discord',
  'priceLists',
  'globalDefaults',
] as const
const activeTab = useUrlTab({
  validTabs: ADMIN_TABS,
  defaultTab: 'approvals',
})

const userHeaders = [
  { title: 'Username', key: 'username', sortable: false },
  { title: 'Display Name', key: 'displayName', sortable: false },
  { title: 'Status', key: 'isActive', sortable: false },
  { title: 'Roles', key: 'roles', sortable: false },
  { title: 'Discord', key: 'discord', sortable: false, width: 120 },
  { title: 'FIO Sync', key: 'fioSync', sortable: false },
  { title: 'Created', key: 'createdAt', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 },
]

const userList = ref<AdminUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const search = ref('')
const loading = ref(false)
const syncingUsers = ref<Set<number>>(new Set())
const disconnectingDiscord = ref<Set<number>>(new Set())
const availableRoles = ref<Role[]>([])

const editDialog = ref(false)
const editingUser = ref<AdminUser | null>(null)
const editForm = ref({
  isActive: true,
  roles: [] as string[],
})
const saving = ref(false)

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// Password reset link state
const resetLinkDialog = ref(false)
const resetLinkData = ref<PasswordResetLinkData | null>(null)
const generatingResetLink = ref(false)

// Pending approvals state
const pendingApprovals = ref<AdminUser[]>([])
const loadingApprovals = ref(false)
const approvingUsers = ref<Set<number>>(new Set())
const approvalRoleSelections = ref<Record<number, string>>({})
const rejectDialog = ref(false)
const rejectingUser = ref<AdminUser | null>(null)
const rejectingLoading = ref(false)

// Delete user state
const deleteUserDialog = ref(false)
const deletingUser = ref<AdminUser | null>(null)
const deletingUserLoading = ref(false)

// Computed: Roles available for approval (exclude unverified)
const approvalRoleOptions = computed(() => {
  return availableRoles.value.filter(r => r.id !== 'unverified')
})

// Permissions state
const permissionList = ref<Permission[]>([])
const rolePermissionsList = ref<RolePermissionWithDetails[]>([])
const loadingPermissions = ref(false)
const togglingPermissions = ref<Set<string>>(new Set())

// Roles management state
const roleDialog = ref(false)
const editingRole = ref<Role | null>(null)
const roleForm = ref({
  id: '',
  name: '',
  color: '',
})
const savingRole = ref(false)
const deleteRoleDialog = ref(false)
const deletingRole = ref<Role | null>(null)
const deletingRoleLoading = ref(false)
const roleFormRef = ref()

// Discord settings state
const discordSettings = ref<DiscordSettings | null>(null)
const discordForm = ref({
  clientId: '',
  clientSecret: '',
  botToken: '',
  redirectUri: '',
  guildId: '',
  autoApprovalEnabled: false,
})
const showClientSecret = ref(false)
const showBotToken = ref(false)
const savingDiscordSettings = ref(false)
const testingConnection = ref(false)
const loadingRoleMappings = ref(false)
const discordRoleMappings = ref<DiscordRoleMapping[]>([])
const discordGuildRoles = ref<DiscordRole[]>([])
const loadingDiscordRoles = ref(false)

// Role mapping dialog state
const mappingDialog = ref(false)
const editingMapping = ref<DiscordRoleMapping | null>(null)
const mappingForm = ref({
  discordRoleId: '',
  discordRoleName: '',
  appRoleId: '',
  priority: 0,
})
const savingMapping = ref(false)
const deleteMappingDialog = ref(false)
const deletingMapping = ref<DiscordRoleMapping | null>(null)
const deletingMappingLoading = ref(false)

// Price settings state
const priceSettings = ref<PriceSettingsResponse | null>(null)
const priceSettingsForm = ref({
  fioBaseUrl: '',
  fioPriceField: 'PriceAverage' as FioPriceField,
  googleApiKey: '',
})
const showGoogleApiKey = ref(false)
const savingFioSettings = ref(false)
const savingGoogleSettings = ref(false)

// Price Lists management state
const priceLists = ref<PriceListDefinition[]>([])
const loadingPriceLists = ref(false)
const priceListDialog = ref(false)
const editingPriceList = ref<PriceListDefinition | null>(null)
const deletingPriceList = ref<PriceListDefinition | null>(null)
const deletePriceListDialog = ref(false)
const deletingPriceListLoading = ref(false)

// Import Configs management state
const importConfigs = ref<ImportConfigResponse[]>([])
const loadingImportConfigs = ref(false)
const importConfigDialog = ref(false)
const editingImportConfig = ref<ImportConfigResponse | null>(null)
const newImportConfigPriceList = ref<string | null>(null)
const syncingConfigs = ref<Set<number>>(new Set())
const syncingFioPriceLists = ref<Set<string>>(new Set())
const deleteImportConfigDialog = ref(false)
const deletingImportConfig = ref<ImportConfigResponse | null>(null)
const deletingImportConfigLoading = ref(false)

// Price Adjustments management state
const priceAdjustments = ref<PriceAdjustmentResponse[]>([])
const loadingAdjustments = ref(false)
const adjustmentDialog = ref(false)
const adjustmentDialogBehavior = useDialogBehavior({ modelValue: adjustmentDialog })
const editingAdjustment = ref<PriceAdjustmentResponse | null>(null)
const adjustmentForm = ref({
  priceListCode: null as string | null,
  commodityTicker: null as string | null,
  locationId: null as string | null,
  adjustmentType: 'percentage' as AdjustmentType,
  adjustmentValue: 0,
  priority: 0,
  description: null as string | null,
  isActive: true,
})
const savingAdjustment = ref(false)
const deleteAdjustmentDialog = ref(false)
const deletingAdjustment = ref<PriceAdjustmentResponse | null>(null)
const deletingAdjustmentLoading = ref(false)

const fioPriceFieldOptions = [
  { title: 'Price Average (30-day weighted)', value: 'PriceAverage' },
  { title: 'Market Maker Buy', value: 'MMBuy' },
  { title: 'Market Maker Sell', value: 'MMSell' },
  { title: 'Ask (lowest sell)', value: 'Ask' },
  { title: 'Bid (highest buy)', value: 'Bid' },
]

// Global Defaults management state
const globalDefaults = ref<GlobalDefaultSetting[]>([])
const loadingGlobalDefaults = ref(false)
const globalDefaultsForm = ref<Record<string, unknown>>({})
const savingGlobalDefault = ref<string | null>(null)
const resettingGlobalDefault = ref<string | null>(null)
const openDefaultPanels = ref<string[]>([])

// Global Defaults: Reference data for special fields
const globalDefaultsPriceLists = ref<{ title: string; value: string }[]>([])
const loadingGlobalDefaultsPriceLists = ref(false)

// Timezone options
const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const timezoneOptions = computed(() => {
  const timezones =
    (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ||
    []
  return [
    { title: `Auto (${detectedTimezone})`, value: 'auto' },
    ...timezones.map((tz: string) => ({ title: tz, value: tz })),
  ]
})

// Display mode options
const locationDisplayModes = [
  { title: 'Names Only (e.g., Benten Station, Katoa)', value: 'names-only' },
  { title: 'Natural IDs Only (e.g., BEN, UV-351a)', value: 'natural-ids-only' },
  { title: 'Both (e.g., Benten Station (BEN), Katoa (UV-351a))', value: 'both' },
]
const commodityDisplayModes = [
  { title: 'Ticker Only (e.g., RAT)', value: 'ticker-only' },
  { title: 'Name Only (e.g., Basic Rations)', value: 'name-only' },
  { title: 'Both (e.g., RAT - Basic Rations)', value: 'both' },
]

// Currency options (from settings enum)
const currencyOptions = ['ICA', 'CIS', 'AIC', 'NCC']

// Category metadata for Global Defaults
const globalDefaultCategories = computed(() => {
  const categories = new Map<string, { id: string; label: string; description: string }>()
  for (const setting of globalDefaults.value) {
    const category = setting.definition.category
    if (!categories.has(category)) {
      categories.set(category, getCategoryInfo(category))
    }
  }
  return Array.from(categories.values())
})

function getCategoryInfo(category: string): { id: string; label: string; description: string } {
  const categoryMap: Record<string, { label: string; description: string }> = {
    general: { label: 'General', description: 'Timezone, formatting, and display preferences' },
    display: { label: 'Display', description: 'How names and identifiers are shown' },
    market: { label: 'Market', description: 'Trading preferences' },
    notifications: { label: 'Notifications', description: 'Notification preferences' },
    fio: { label: 'FIO Integration', description: 'FIO data synchronization settings' },
  }
  return { id: category, ...(categoryMap[category] || { label: category, description: '' }) }
}

function getSettingsForCategory(categoryId: string): GlobalDefaultSetting[] {
  return globalDefaults.value.filter(s => s.definition.category === categoryId)
}

function getOverrideCount(categoryId: string): number {
  return getSettingsForCategory(categoryId).filter(s => s.adminDefault !== null).length
}

// Discord computed properties - OAuth and Bot settings
const hasOAuthSettingsChanges = computed(() => {
  return (
    discordForm.value.clientId !== (discordSettings.value?.clientId || '') ||
    discordForm.value.clientSecret !== '' ||
    discordForm.value.redirectUri !== (discordSettings.value?.redirectUri || '')
  )
})

const hasBotSettingsChanges = computed(() => {
  return (
    discordForm.value.botToken !== '' ||
    discordForm.value.guildId !== (discordSettings.value?.guildId || '') ||
    discordForm.value.autoApprovalEnabled !== (discordSettings.value?.autoApprovalEnabled || false)
  )
})

// Price settings computed properties
const hasFioSettingsChanges = computed(() => {
  return (
    priceSettingsForm.value.fioBaseUrl !== (priceSettings.value?.fioBaseUrl || '') ||
    priceSettingsForm.value.fioPriceField !== (priceSettings.value?.fioPriceField || 'PriceAverage')
  )
})

const vuetifyColors = [
  { title: 'Grey', value: 'grey' },
  { title: 'Blue Grey', value: 'blue-grey' },
  { title: 'Blue', value: 'blue' },
  { title: 'Light Blue', value: 'light-blue' },
  { title: 'Cyan', value: 'cyan' },
  { title: 'Teal', value: 'teal' },
  { title: 'Green', value: 'green' },
  { title: 'Light Green', value: 'light-green' },
  { title: 'Lime', value: 'lime' },
  { title: 'Yellow', value: 'yellow' },
  { title: 'Amber', value: 'amber' },
  { title: 'Orange', value: 'orange' },
  { title: 'Deep Orange', value: 'deep-orange' },
  { title: 'Red', value: 'red' },
  { title: 'Pink', value: 'pink' },
  { title: 'Purple', value: 'purple' },
  { title: 'Deep Purple', value: 'deep-purple' },
  { title: 'Indigo', value: 'indigo' },
]

const resetLinkUrl = computed(() => {
  if (!resetLinkData.value) return ''
  return `${window.location.origin}/reset-password?token=${resetLinkData.value.token}`
})

const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = { show: true, message, color }
}

const formatDate = (dateStr: string): string => {
  return new Date(dateStr).toLocaleDateString()
}

const formatDateTime = (dateStr: string | undefined): string => {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleString()
}

const formatRelativeTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatDate(dateStr)
}

const getSyncStatusColor = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)

  if (diffHours > 48) return 'error'
  if (diffHours > 24) return 'warning'
  return 'success'
}

let searchTimeout: ReturnType<typeof setTimeout>
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    page.value = 1
    loadUsers()
  }, 300)
}

const loadUsers = async () => {
  try {
    loading.value = true
    const response = await api.admin.listUsers(
      page.value,
      pageSize.value,
      search.value || undefined
    )
    userList.value = response.users
    total.value = response.total
  } catch (error) {
    console.error('Failed to load users', error)
    showSnackbar('Failed to load users', 'error')
  } finally {
    loading.value = false
  }
}

const syncUserFio = async (user: AdminUser) => {
  try {
    syncingUsers.value.add(user.id)
    const result = await api.admin.syncUserFio(user.id)
    if (result.success) {
      showSnackbar(`Synced ${result.inserted} items for ${result.username}`)
      // Refresh the user list to update sync timestamp
      await loadUsers()
    } else {
      showSnackbar(`Sync completed with errors: ${result.errors.join(', ')}`, 'error')
    }
  } catch (error) {
    console.error('Failed to sync FIO', error)
    const message = error instanceof Error ? error.message : 'Failed to sync FIO'
    showSnackbar(message, 'error')
  } finally {
    syncingUsers.value.delete(user.id)
  }
}

const disconnectUserDiscord = async (user: AdminUser) => {
  if (!window.confirm(`Disconnect Discord for ${user.username}?`)) {
    return
  }
  try {
    disconnectingDiscord.value.add(user.id)
    const result = await api.admin.disconnectUserDiscord(user.id)
    showSnackbar(`Discord disconnected for ${result.username}`)
    // Refresh the user list to update Discord status
    await loadUsers()
  } catch (error) {
    console.error('Failed to disconnect Discord', error)
    const message = error instanceof Error ? error.message : 'Failed to disconnect Discord'
    showSnackbar(message, 'error')
  } finally {
    disconnectingDiscord.value.delete(user.id)
  }
}

// Track if roles were modified (for refreshing user list)
const rolesModified = ref(false)

const loadRoles = async () => {
  try {
    const roles = await api.admin.listRoles()
    // Sort alphabetically by ID for stable ordering
    availableRoles.value = roles.sort((a, b) => a.id.localeCompare(b.id))
  } catch (error) {
    console.error('Failed to load roles', error)
  }
}

const loadPermissions = async () => {
  try {
    loadingPermissions.value = true
    const [perms, rolePerms] = await Promise.all([
      api.admin.listPermissions(),
      api.admin.listRolePermissions(),
    ])
    // Sort alphabetically by ID for stable ordering
    permissionList.value = perms.sort((a, b) => a.id.localeCompare(b.id))
    rolePermissionsList.value = rolePerms
  } catch (error) {
    console.error('Failed to load permissions', error)
    showSnackbar('Failed to load permissions', 'error')
  } finally {
    loadingPermissions.value = false
  }
}

const openEditDialog = (user: AdminUser) => {
  editingUser.value = user
  editForm.value = {
    isActive: user.isActive,
    roles: user.roles.map(r => r.id),
  }
  editDialog.value = true
}

const saveUser = async () => {
  if (!editingUser.value) return

  try {
    saving.value = true
    await api.admin.updateUser(editingUser.value.id, {
      isActive: editForm.value.isActive,
      roles: editForm.value.roles,
    })
    showSnackbar('User updated successfully')
    editDialog.value = false
    loadUsers()
  } catch (error) {
    console.error('Failed to update user', error)
    const message = error instanceof Error ? error.message : 'Failed to update user'
    showSnackbar(message, 'error')
  } finally {
    saving.value = false
  }
}

const generateResetLink = async () => {
  if (!editingUser.value) return

  try {
    generatingResetLink.value = true
    const response = await api.admin.generatePasswordResetLink(editingUser.value.id)
    resetLinkData.value = response
    resetLinkDialog.value = true
  } catch (error) {
    console.error('Failed to generate reset link', error)
    const message = error instanceof Error ? error.message : 'Failed to generate reset link'
    showSnackbar(message, 'error')
  } finally {
    generatingResetLink.value = false
  }
}

const copyResetLink = async () => {
  try {
    await navigator.clipboard.writeText(resetLinkUrl.value)
    showSnackbar('Reset link copied to clipboard')
  } catch {
    showSnackbar('Failed to copy link', 'error')
  }
}

// Permission matrix functions
const getPermissionStatus = (roleId: string, permissionId: string): boolean | null => {
  const mapping = rolePermissionsList.value.find(
    rp => rp.roleId === roleId && rp.permissionId === permissionId
  )
  if (!mapping) return null
  return mapping.allowed
}

const isTogglingPermission = (roleId: string, permissionId: string): boolean => {
  return togglingPermissions.value.has(`${roleId}:${permissionId}`)
}

const togglePermission = async (roleId: string, permissionId: string) => {
  const key = `${roleId}:${permissionId}`
  const currentStatus = getPermissionStatus(roleId, permissionId)
  const existingMapping = rolePermissionsList.value.find(
    rp => rp.roleId === roleId && rp.permissionId === permissionId
  )

  try {
    togglingPermissions.value.add(key)

    if (currentStatus === null) {
      // Not set -> Grant
      const result = await api.admin.setRolePermission({ roleId, permissionId, allowed: true })
      // Update local state with the real ID from the server
      const role = availableRoles.value.find(r => r.id === roleId)
      const permission = permissionList.value.find(p => p.id === permissionId)
      rolePermissionsList.value.push({
        id: result.id,
        roleId,
        roleName: role?.name || roleId,
        roleColor: role?.color || 'grey',
        permissionId,
        permissionName: permission?.name || permissionId,
        allowed: true,
      })
    } else if (currentStatus === true) {
      // Granted -> Deny
      const result = await api.admin.setRolePermission({ roleId, permissionId, allowed: false })
      // Update local state - the server returns the same record with updated allowed
      if (existingMapping) {
        existingMapping.id = result.id // In case ID changed (shouldn't, but be safe)
        existingMapping.allowed = false
      }
    } else {
      // Denied -> Remove (delete the mapping)
      if (existingMapping) {
        await api.admin.deleteRolePermission(existingMapping.id)
        // Update local state - remove from array
        const index = rolePermissionsList.value.indexOf(existingMapping)
        if (index > -1) {
          rolePermissionsList.value.splice(index, 1)
        }
      }
    }
  } catch (error) {
    console.error('Failed to toggle permission', error)
    showSnackbar('Failed to update permission', 'error')
    // On error, reload to restore correct state
    await loadPermissions()
  } finally {
    togglingPermissions.value.delete(key)
  }
}

// Role management functions
const openCreateRoleDialog = () => {
  editingRole.value = null
  roleForm.value = { id: '', name: '', color: 'grey' }
  roleDialog.value = true
}

const openEditRoleDialog = (role: Role) => {
  editingRole.value = role
  roleForm.value = { id: role.id, name: role.name, color: role.color }
  roleDialog.value = true
}

const saveRole = async () => {
  try {
    savingRole.value = true

    if (editingRole.value) {
      // Update existing role
      await api.admin.updateRole(editingRole.value.id, {
        name: roleForm.value.name,
        color: roleForm.value.color,
      })
      showSnackbar('Role updated successfully')
    } else {
      // Create new role
      await api.admin.createRole({
        id: roleForm.value.id,
        name: roleForm.value.name,
        color: roleForm.value.color,
      })
      showSnackbar('Role created successfully')
    }

    roleDialog.value = false
    rolesModified.value = true
    await loadRoles()
  } catch (error) {
    console.error('Failed to save role', error)
    const message = error instanceof Error ? error.message : 'Failed to save role'
    showSnackbar(message, 'error')
  } finally {
    savingRole.value = false
  }
}

const confirmDeleteRole = (role: Role) => {
  deletingRole.value = role
  deleteRoleDialog.value = true
}

const deleteRole = async () => {
  if (!deletingRole.value) return

  try {
    deletingRoleLoading.value = true
    await api.admin.deleteRole(deletingRole.value.id)
    showSnackbar('Role deleted successfully')
    deleteRoleDialog.value = false
    rolesModified.value = true
    await loadRoles()
  } catch (error) {
    console.error('Failed to delete role', error)
    const message = error instanceof Error ? error.message : 'Failed to delete role'
    showSnackbar(message, 'error')
  } finally {
    deletingRoleLoading.value = false
  }
}

// Pending approvals functions
const loadPendingApprovals = async () => {
  try {
    loadingApprovals.value = true
    pendingApprovals.value = await api.admin.listPendingApprovals()
    // Set default role selection for each user
    for (const user of pendingApprovals.value) {
      if (!approvalRoleSelections.value[user.id]) {
        approvalRoleSelections.value[user.id] = 'trade-partner'
      }
    }
  } catch (error) {
    console.error('Failed to load pending approvals', error)
    showSnackbar('Failed to load pending approvals', 'error')
  } finally {
    loadingApprovals.value = false
  }
}

const approveUser = async (user: AdminUser) => {
  try {
    approvingUsers.value.add(user.id)
    const selectedRole = approvalRoleSelections.value[user.id] || 'trade-partner'
    await api.admin.approveUser(user.id, selectedRole)
    showSnackbar(`${user.displayName} approved as ${selectedRole}`)
    // Remove from pending list
    pendingApprovals.value = pendingApprovals.value.filter(u => u.id !== user.id)
    delete approvalRoleSelections.value[user.id]
    // Notify App.vue to update the badge count
    window.dispatchEvent(new CustomEvent('approval-queue-updated'))
  } catch (error) {
    console.error('Failed to approve user', error)
    const message = error instanceof Error ? error.message : 'Failed to approve user'
    showSnackbar(message, 'error')
  } finally {
    approvingUsers.value.delete(user.id)
  }
}

const openRejectDialog = (user: AdminUser) => {
  rejectingUser.value = user
  rejectDialog.value = true
}

const rejectUser = async () => {
  if (!rejectingUser.value) return

  try {
    rejectingLoading.value = true
    // Rejecting = deactivating the account
    await api.admin.updateUser(rejectingUser.value.id, {
      isActive: false,
      roles: ['unverified'],
    })
    showSnackbar(`${rejectingUser.value.displayName} has been rejected`)
    rejectDialog.value = false
    // Remove from pending list
    pendingApprovals.value = pendingApprovals.value.filter(u => u.id !== rejectingUser.value?.id)
    // Notify App.vue to update the badge count
    window.dispatchEvent(new CustomEvent('approval-queue-updated'))
  } catch (error) {
    console.error('Failed to reject user', error)
    const message = error instanceof Error ? error.message : 'Failed to reject user'
    showSnackbar(message, 'error')
  } finally {
    rejectingLoading.value = false
    rejectingUser.value = null
  }
}

// Delete user functions
const openDeleteUserDialog = (user: AdminUser) => {
  deletingUser.value = user
  deleteUserDialog.value = true
}

const deleteUser = async () => {
  if (!deletingUser.value) return

  try {
    deletingUserLoading.value = true
    await api.admin.deleteUser(deletingUser.value.id)
    showSnackbar(`${deletingUser.value.displayName} has been permanently deleted`)
    deleteUserDialog.value = false
    // Reload users list
    loadUsers()
    // Remove from pending list if they were there
    pendingApprovals.value = pendingApprovals.value.filter(u => u.id !== deletingUser.value?.id)
    // Notify App.vue to update the badge count
    window.dispatchEvent(new CustomEvent('approval-queue-updated'))
  } catch (error) {
    console.error('Failed to delete user', error)
    const message = error instanceof Error ? error.message : 'Failed to delete user'
    showSnackbar(message, 'error')
  } finally {
    deletingUserLoading.value = false
    deletingUser.value = null
  }
}

// Discord functions
const loadDiscordSettings = async () => {
  try {
    discordSettings.value = await api.adminDiscord.getSettings()
    // Initialize form with current settings
    discordForm.value.clientId = discordSettings.value.clientId || ''
    discordForm.value.redirectUri = discordSettings.value.redirectUri || ''
    discordForm.value.guildId = discordSettings.value.guildId || ''
    discordForm.value.autoApprovalEnabled = discordSettings.value.autoApprovalEnabled || false
    // Don't populate secrets - they should only be entered when changing
    discordForm.value.clientSecret = ''
    discordForm.value.botToken = ''
  } catch (error) {
    console.error('Failed to load Discord settings', error)
    showSnackbar('Failed to load Discord settings', 'error')
  }
}

const loadRoleMappings = async () => {
  try {
    loadingRoleMappings.value = true
    discordRoleMappings.value = await api.adminDiscord.getRoleMappings()
  } catch (error) {
    console.error('Failed to load role mappings', error)
  } finally {
    loadingRoleMappings.value = false
  }
}

const loadDiscordGuildRoles = async () => {
  if (!discordSettings.value?.guildId) return

  try {
    loadingDiscordRoles.value = true
    discordGuildRoles.value = await api.adminDiscord.getGuildRoles()
  } catch (error) {
    console.error('Failed to load Discord guild roles', error)
    showSnackbar('Failed to load Discord guild roles', 'error')
  } finally {
    loadingDiscordRoles.value = false
  }
}

const saveOAuthSettings = async () => {
  try {
    savingDiscordSettings.value = true
    const settings: Record<string, string | undefined> = {
      clientId: discordForm.value.clientId,
      redirectUri: discordForm.value.redirectUri,
    }
    if (discordForm.value.clientSecret) {
      settings.clientSecret = discordForm.value.clientSecret
    }
    discordSettings.value = await api.adminDiscord.updateSettings(settings)
    // Clear password field after save
    discordForm.value.clientSecret = ''
    showSnackbar('OAuth settings saved successfully')
  } catch (error) {
    console.error('Failed to save OAuth settings', error)
    const message = error instanceof Error ? error.message : 'Failed to save OAuth settings'
    showSnackbar(message, 'error')
  } finally {
    savingDiscordSettings.value = false
  }
}

const saveBotSettings = async () => {
  try {
    savingDiscordSettings.value = true
    const settings: Record<string, string | boolean | undefined> = {
      guildId: discordForm.value.guildId,
      autoApprovalEnabled: discordForm.value.autoApprovalEnabled,
    }
    if (discordForm.value.botToken) {
      settings.botToken = discordForm.value.botToken
    }
    discordSettings.value = await api.adminDiscord.updateSettings(settings)
    // Clear password field after save
    discordForm.value.botToken = ''
    showSnackbar('Bot settings saved successfully')
  } catch (error) {
    console.error('Failed to save bot settings', error)
    const message = error instanceof Error ? error.message : 'Failed to save bot settings'
    showSnackbar(message, 'error')
  } finally {
    savingDiscordSettings.value = false
  }
}

const testDiscordConnection = async () => {
  try {
    testingConnection.value = true
    // First save the guild ID if changed
    if (discordForm.value.guildId !== (discordSettings.value?.guildId || '')) {
      await api.adminDiscord.updateSettings({
        guildId: discordForm.value.guildId,
      })
    }
    const result = await api.adminDiscord.testConnection()
    if (result.success && result.guild) {
      // Reload settings to get updated guild info
      await loadDiscordSettings()
      await loadDiscordGuildRoles()
      showSnackbar(`Connected to ${result.guild.name}`)
    } else {
      showSnackbar(result.error || 'Connection test failed', 'error')
    }
  } catch (error) {
    console.error('Failed to test Discord connection', error)
    const message = error instanceof Error ? error.message : 'Failed to test Discord connection'
    showSnackbar(message, 'error')
  } finally {
    testingConnection.value = false
  }
}

const getAppRoleColor = (roleId: string): string => {
  const role = availableRoles.value.find(r => r.id === roleId)
  return role?.color || 'grey'
}

const getDiscordRoleColor = (colorValue: number): string => {
  if (!colorValue) return '#99aab5' // Default Discord role color
  return `#${colorValue.toString(16).padStart(6, '0')}`
}

const openCreateMappingDialog = async () => {
  editingMapping.value = null
  mappingForm.value = {
    discordRoleId: '',
    discordRoleName: '',
    appRoleId: '',
    priority: 0,
  }
  mappingDialog.value = true
  // Load Discord roles if not already loaded
  if (discordGuildRoles.value.length === 0) {
    await loadDiscordGuildRoles()
  }
}

const openEditMappingDialog = async (mapping: DiscordRoleMapping) => {
  editingMapping.value = mapping
  mappingForm.value = {
    discordRoleId: mapping.discordRoleId,
    discordRoleName: mapping.discordRoleName,
    appRoleId: mapping.appRoleId,
    priority: mapping.priority,
  }
  mappingDialog.value = true
  // Load Discord roles if not already loaded
  if (discordGuildRoles.value.length === 0) {
    await loadDiscordGuildRoles()
  }
}

const saveMapping = async () => {
  try {
    savingMapping.value = true
    // Get the Discord role name from the selected role
    const selectedDiscordRole = discordGuildRoles.value.find(
      r => r.id === mappingForm.value.discordRoleId
    )
    const discordRoleName = selectedDiscordRole?.name || mappingForm.value.discordRoleId

    if (editingMapping.value) {
      await api.adminDiscord.updateRoleMapping(editingMapping.value.id, {
        discordRoleId: mappingForm.value.discordRoleId,
        discordRoleName,
        appRoleId: mappingForm.value.appRoleId,
        priority: mappingForm.value.priority,
      })
      showSnackbar('Role mapping updated successfully')
    } else {
      await api.adminDiscord.createRoleMapping({
        discordRoleId: mappingForm.value.discordRoleId,
        discordRoleName,
        appRoleId: mappingForm.value.appRoleId,
        priority: mappingForm.value.priority,
      })
      showSnackbar('Role mapping created successfully')
    }
    mappingDialog.value = false
    await loadRoleMappings()
  } catch (error) {
    console.error('Failed to save role mapping', error)
    const message = error instanceof Error ? error.message : 'Failed to save role mapping'
    showSnackbar(message, 'error')
  } finally {
    savingMapping.value = false
  }
}

const confirmDeleteMapping = (mapping: DiscordRoleMapping) => {
  deletingMapping.value = mapping
  deleteMappingDialog.value = true
}

const deleteMapping = async () => {
  if (!deletingMapping.value) return

  try {
    deletingMappingLoading.value = true
    await api.adminDiscord.deleteRoleMapping(deletingMapping.value.id)
    showSnackbar('Role mapping deleted successfully')
    deleteMappingDialog.value = false
    await loadRoleMappings()
  } catch (error) {
    console.error('Failed to delete role mapping', error)
    const message = error instanceof Error ? error.message : 'Failed to delete role mapping'
    showSnackbar(message, 'error')
  } finally {
    deletingMappingLoading.value = false
    deletingMapping.value = null
  }
}

// Price settings functions
const loadPriceSettings = async () => {
  try {
    priceSettings.value = await api.adminPriceSettings.get()
    // Initialize form with current settings
    priceSettingsForm.value.fioBaseUrl = priceSettings.value.fioBaseUrl || ''
    priceSettingsForm.value.fioPriceField = priceSettings.value.fioPriceField || 'PriceAverage'
    // Don't populate API key - it should only be entered when changing
    priceSettingsForm.value.googleApiKey = ''
  } catch (error) {
    console.error('Failed to load price settings', error)
    showSnackbar('Failed to load price settings', 'error')
  }
}

const saveFioSettings = async () => {
  try {
    savingFioSettings.value = true
    priceSettings.value = await api.adminPriceSettings.updateFio({
      baseUrl: priceSettingsForm.value.fioBaseUrl,
      priceField: priceSettingsForm.value.fioPriceField,
    })
    showSnackbar('FIO settings saved successfully')
  } catch (error) {
    console.error('Failed to save FIO settings', error)
    const message = error instanceof Error ? error.message : 'Failed to save FIO settings'
    showSnackbar(message, 'error')
  } finally {
    savingFioSettings.value = false
  }
}

const saveGoogleSettings = async () => {
  try {
    savingGoogleSettings.value = true
    priceSettings.value = await api.adminPriceSettings.updateGoogle({
      apiKey: priceSettingsForm.value.googleApiKey,
    })
    // Clear the API key field after save
    priceSettingsForm.value.googleApiKey = ''
    showSnackbar('Google API key saved successfully')
  } catch (error) {
    console.error('Failed to save Google settings', error)
    const message = error instanceof Error ? error.message : 'Failed to save Google settings'
    showSnackbar(message, 'error')
  } finally {
    savingGoogleSettings.value = false
  }
}

// Price Lists management functions
const loadPriceLists = async () => {
  try {
    loadingPriceLists.value = true
    priceLists.value = await api.priceLists.list()
  } catch (error) {
    console.error('Failed to load price lists', error)
    showSnackbar('Failed to load price lists', 'error')
  } finally {
    loadingPriceLists.value = false
  }
}

const openCreatePriceListDialog = () => {
  editingPriceList.value = null
  priceListDialog.value = true
}

const openEditPriceListDialog = (priceList: PriceListDefinition) => {
  editingPriceList.value = priceList
  priceListDialog.value = true
}

const onPriceListSaved = async () => {
  await loadPriceLists()
  showSnackbar('Price list saved successfully')
}

const confirmDeletePriceList = (priceList: PriceListDefinition) => {
  deletingPriceList.value = priceList
  deletePriceListDialog.value = true
}

const deletePriceListConfirm = async () => {
  if (!deletingPriceList.value) return

  try {
    deletingPriceListLoading.value = true
    await api.priceLists.delete(deletingPriceList.value.code)
    showSnackbar('Price list deleted successfully')
    deletePriceListDialog.value = false
    await loadPriceLists()
  } catch (error) {
    console.error('Failed to delete price list', error)
    const message = error instanceof Error ? error.message : 'Failed to delete price list'
    showSnackbar(message, 'error')
  } finally {
    deletingPriceListLoading.value = false
    deletingPriceList.value = null
  }
}

// Import Configs management functions
const loadImportConfigs = async () => {
  try {
    loadingImportConfigs.value = true
    const configs = await api.importConfigs.list()
    importConfigs.value = configs
  } catch (error) {
    console.error('Failed to load import configs', error)
    showSnackbar('Failed to load import configs', 'error')
  } finally {
    loadingImportConfigs.value = false
  }
}

const openCreateImportConfigDialog = (priceListCode?: string) => {
  editingImportConfig.value = null
  newImportConfigPriceList.value = priceListCode || null
  importConfigDialog.value = true
}

const openEditImportConfigDialog = (config: ImportConfigResponse) => {
  editingImportConfig.value = config
  newImportConfigPriceList.value = null
  importConfigDialog.value = true
}

const onImportConfigSaved = async () => {
  await loadImportConfigs()
  await loadPriceLists() // Refresh counts
  showSnackbar('Import configuration saved successfully')
}

const confirmDeleteImportConfig = (config: ImportConfigResponse) => {
  deletingImportConfig.value = config
  deleteImportConfigDialog.value = true
}

const deleteImportConfigConfirm = async () => {
  if (!deletingImportConfig.value) return

  try {
    deletingImportConfigLoading.value = true
    await api.importConfigs.delete(deletingImportConfig.value.id)
    showSnackbar('Import configuration deleted successfully')
    deleteImportConfigDialog.value = false
    await loadImportConfigs()
    await loadPriceLists() // Refresh counts
  } catch (error) {
    console.error('Failed to delete import config', error)
    const message = error instanceof Error ? error.message : 'Failed to delete import config'
    showSnackbar(message, 'error')
  } finally {
    deletingImportConfigLoading.value = false
    deletingImportConfig.value = null
  }
}

const syncImportConfig = async (config: ImportConfigResponse) => {
  try {
    syncingConfigs.value.add(config.id)
    const result = await api.importConfigs.sync(config.id)
    showSnackbar(
      `Synced ${result.imported} new, ${result.updated} updated prices`,
      result.errors.length > 0 ? 'error' : 'success'
    )
    await loadPriceLists() // Refresh price counts
  } catch (error) {
    console.error('Failed to sync import config', error)
    const message = error instanceof Error ? error.message : 'Failed to sync import config'
    showSnackbar(message, 'error')
  } finally {
    syncingConfigs.value.delete(config.id)
  }
}

const getImportConfigsForPriceList = (priceListCode: string) => {
  return importConfigs.value.filter(c => c.priceListCode === priceListCode)
}

const syncFioPriceList = async (priceList: PriceListDefinition) => {
  try {
    syncingFioPriceLists.value.add(priceList.code)
    const result = await api.fioPriceSync.syncExchange(priceList.code)
    if (result.success) {
      showSnackbar(`Synced ${result.totalUpdated} prices for ${priceList.code}`)
    } else {
      showSnackbar(
        result.errors.length > 0 ? result.errors[0] : 'Sync completed with errors',
        'error'
      )
    }
    await loadPriceLists() // Refresh price counts
  } catch (error) {
    console.error('Failed to sync FIO prices', error)
    const message = error instanceof Error ? error.message : 'Failed to sync FIO prices'
    showSnackbar(message, 'error')
  } finally {
    syncingFioPriceLists.value.delete(priceList.code)
  }
}

// Price Adjustments management functions
const loadPriceAdjustments = async () => {
  try {
    loadingAdjustments.value = true
    priceAdjustments.value = await api.priceAdjustments.list()
  } catch (error) {
    console.error('Failed to load price adjustments', error)
    showSnackbar('Failed to load price adjustments', 'error')
  } finally {
    loadingAdjustments.value = false
  }
}

const openCreateAdjustmentDialog = () => {
  editingAdjustment.value = null
  adjustmentForm.value = {
    priceListCode: null,
    commodityTicker: null,
    locationId: null,
    adjustmentType: 'percentage',
    adjustmentValue: 0,
    priority: 0,
    description: null,
    isActive: true,
  }
  adjustmentDialog.value = true
}

const openEditAdjustmentDialog = (adjustment: PriceAdjustmentResponse) => {
  editingAdjustment.value = adjustment
  adjustmentForm.value = {
    priceListCode: adjustment.priceListCode,
    commodityTicker: adjustment.commodityTicker,
    locationId: adjustment.locationId,
    adjustmentType: adjustment.adjustmentType as AdjustmentType,
    adjustmentValue: parseFloat(adjustment.adjustmentValue),
    priority: adjustment.priority,
    description: adjustment.description,
    isActive: adjustment.isActive,
  }
  adjustmentDialog.value = true
}

const saveAdjustment = async () => {
  try {
    savingAdjustment.value = true
    if (editingAdjustment.value) {
      const updateData: UpdatePriceAdjustmentRequest = {
        priceListCode: adjustmentForm.value.priceListCode,
        commodityTicker: adjustmentForm.value.commodityTicker,
        locationId: adjustmentForm.value.locationId,
        adjustmentType: adjustmentForm.value.adjustmentType,
        adjustmentValue: adjustmentForm.value.adjustmentValue,
        priority: adjustmentForm.value.priority,
        description: adjustmentForm.value.description,
        isActive: adjustmentForm.value.isActive,
      }
      await api.priceAdjustments.update(editingAdjustment.value.id, updateData)
      showSnackbar('Adjustment updated successfully')
    } else {
      const createData: CreatePriceAdjustmentRequest = {
        priceListCode: adjustmentForm.value.priceListCode,
        commodityTicker: adjustmentForm.value.commodityTicker,
        locationId: adjustmentForm.value.locationId,
        adjustmentType: adjustmentForm.value.adjustmentType,
        adjustmentValue: adjustmentForm.value.adjustmentValue,
        priority: adjustmentForm.value.priority,
        description: adjustmentForm.value.description,
        isActive: adjustmentForm.value.isActive,
      }
      await api.priceAdjustments.create(createData)
      showSnackbar('Adjustment created successfully')
    }
    adjustmentDialog.value = false
    await loadPriceAdjustments()
  } catch (error) {
    console.error('Failed to save adjustment', error)
    const message = error instanceof Error ? error.message : 'Failed to save adjustment'
    showSnackbar(message, 'error')
  } finally {
    savingAdjustment.value = false
  }
}

const confirmDeleteAdjustment = (adjustment: PriceAdjustmentResponse) => {
  deletingAdjustment.value = adjustment
  deleteAdjustmentDialog.value = true
}

const deleteAdjustmentConfirm = async () => {
  if (!deletingAdjustment.value) return
  try {
    deletingAdjustmentLoading.value = true
    await api.priceAdjustments.delete(deletingAdjustment.value.id)
    showSnackbar('Adjustment deleted successfully')
    deleteAdjustmentDialog.value = false
    await loadPriceAdjustments()
  } catch (error) {
    console.error('Failed to delete adjustment', error)
    const message = error instanceof Error ? error.message : 'Failed to delete adjustment'
    showSnackbar(message, 'error')
  } finally {
    deletingAdjustmentLoading.value = false
    deletingAdjustment.value = null
  }
}

const formatAdjustmentValue = (adjustment: PriceAdjustmentResponse) => {
  const value = parseFloat(adjustment.adjustmentValue)
  if (adjustment.adjustmentType === 'percentage') {
    return `${value >= 0 ? '+' : ''}${value}%`
  }
  return `${value >= 0 ? '+' : ''}${value}`
}

const getAdjustmentScope = (adjustment: PriceAdjustmentResponse) => {
  const parts = []
  if (adjustment.priceListCode) {
    parts.push(adjustment.priceListCode)
  } else {
    parts.push('All price lists')
  }
  if (adjustment.commodityTicker) {
    parts.push(adjustment.commodityName || adjustment.commodityTicker)
  }
  if (adjustment.locationId) {
    parts.push(adjustment.locationName || adjustment.locationId)
  }
  return parts.join(' / ')
}

// Global Defaults management functions
const loadGlobalDefaults = async () => {
  try {
    loadingGlobalDefaults.value = true

    // Load price lists for the defaultPriceList setting
    if (globalDefaultsPriceLists.value.length === 0) {
      loadingGlobalDefaultsPriceLists.value = true
      try {
        const priceLists = await api.priceLists.list()
        globalDefaultsPriceLists.value = priceLists.map(pl => ({
          title: `${pl.code} - ${pl.name}`,
          value: pl.code,
        }))
      } catch (error) {
        console.error('Failed to load price lists for global defaults', error)
      } finally {
        loadingGlobalDefaultsPriceLists.value = false
      }
    }

    const response = await api.adminGlobalDefaults.get()
    globalDefaults.value = response.settings
    // Initialize form with current values
    globalDefaultsForm.value = {}
    for (const setting of response.settings) {
      globalDefaultsForm.value[setting.key] = setting.adminDefault ?? setting.codeDefault
    }
  } catch (error) {
    console.error('Failed to load global defaults', error)
    showSnackbar('Failed to load global defaults', 'error')
  } finally {
    loadingGlobalDefaults.value = false
  }
}

const saveGlobalDefault = async (key: string, value: unknown) => {
  // Normalize empty strings to null for nullable string fields
  let normalizedValue = value
  if (value === '' && key === 'market.defaultPriceList') {
    normalizedValue = null
  }

  // Don't save if value hasn't changed
  const currentSetting = globalDefaults.value.find(s => s.key === key)
  const currentValue = currentSetting?.adminDefault ?? currentSetting?.codeDefault
  if (JSON.stringify(normalizedValue) === JSON.stringify(currentValue)) {
    return
  }

  try {
    savingGlobalDefault.value = key
    const response = await api.adminGlobalDefaults.update({
      settings: { [key]: normalizedValue },
    })
    globalDefaults.value = response.settings
    // Update form
    for (const setting of response.settings) {
      globalDefaultsForm.value[setting.key] = setting.adminDefault ?? setting.codeDefault
    }
    showSnackbar('Default saved', 'success')
  } catch (error) {
    console.error('Failed to save global default', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to save default', 'error')
    // Revert form value
    if (currentSetting) {
      globalDefaultsForm.value[key] = currentSetting.adminDefault ?? currentSetting.codeDefault
    }
  } finally {
    savingGlobalDefault.value = null
  }
}

const resetGlobalDefault = async (key: string) => {
  try {
    resettingGlobalDefault.value = key
    const response = await api.adminGlobalDefaults.reset(key)
    globalDefaults.value = response.settings
    // Update form
    for (const setting of response.settings) {
      globalDefaultsForm.value[setting.key] = setting.adminDefault ?? setting.codeDefault
    }
    showSnackbar('Default reset to code value', 'success')
  } catch (error) {
    console.error('Failed to reset global default', error)
    showSnackbar(error instanceof Error ? error.message : 'Failed to reset default', 'error')
  } finally {
    resettingGlobalDefault.value = null
  }
}

// Watch for tab changes to load data
watch(activeTab, async newTab => {
  if (newTab === 'permissions') {
    // Always reload permissions to ensure fresh data
    if (permissionList.value.length === 0) {
      await loadPermissions()
    }
  } else if (newTab === 'users' && rolesModified.value) {
    // Refresh user list to get updated role colors/names
    rolesModified.value = false
    await loadUsers()
  } else if (newTab === 'discord') {
    // Load Discord settings and role mappings
    if (!discordSettings.value) {
      await loadDiscordSettings()
    }
    if (discordRoleMappings.value.length === 0) {
      await loadRoleMappings()
    }
  } else if (newTab === 'priceLists') {
    // Load price settings, price lists, import configs, and adjustments
    if (!priceSettings.value) {
      await loadPriceSettings()
    }
    // Always load all data together
    await Promise.all([loadPriceLists(), loadImportConfigs(), loadPriceAdjustments()])
  } else if (newTab === 'globalDefaults') {
    // Load global defaults if not already loaded
    if (globalDefaults.value.length === 0) {
      await loadGlobalDefaults()
    }
  }
})

onMounted(() => {
  loadRoles()
  loadUsers()
  loadPendingApprovals()
})
</script>

<style scoped>
.permission-matrix th,
.permission-matrix td {
  white-space: nowrap;
}

.permission-matrix td:first-child {
  width: 1%;
}

.sheet-preview-table {
  max-height: 400px;
  overflow: auto;
  font-size: 0.85rem;
}

.sheet-preview-table th,
.sheet-preview-table td {
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
