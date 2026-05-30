import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import { Switch } from '@renderer/lib/ui/switch';
import { cn } from '@renderer/utils/utils';
import { ResetToDefaultButton } from './ResetToDefaultButton';
import { SettingRow } from './SettingRow';

const NotificationSettingsCard: React.FC = () => {
  const { t } = useTranslation();
  const {
    value: notifications,
    update,
    isLoading: loading,
    isFieldOverridden,
    resetField,
  } = useAppSettingsKey('notifications');

  return (
    <div className="flex flex-col gap-4">
      <SettingRow
        title={t('settings:general.notifications.title')}
        description={t('settings:general.notifications.description')}
        control={
          <>
            <ResetToDefaultButton
              visible={isFieldOverridden('enabled')}
              defaultLabel="on"
              onReset={() => resetField('enabled')}
              disabled={loading}
            />
            <Switch
              checked={notifications?.enabled ?? true}
              disabled={loading}
              onCheckedChange={(next) => update({ enabled: next })}
            />
          </>
        }
      />
      <div
        className={cn(
          'flex flex-col gap-3',
          !notifications?.enabled && 'pointer-events-none opacity-33'
        )}
      >
        <SettingRow
          title={t('settings:general.notifications.sound.title')}
          description={t('settings:general.notifications.sound.description')}
          control={
            <>
              <ResetToDefaultButton
                visible={isFieldOverridden('sound')}
                defaultLabel={t('settings:general.notifications.sound.defaultLabel')}
                onReset={() => resetField('sound')}
                disabled={loading}
              />
              <Switch
                checked={notifications?.sound ?? true}
                disabled={loading}
                onCheckedChange={(next) => update({ sound: next })}
              />
            </>
          }
        />

        <SettingRow
          title={t('settings:general.notifications.soundTiming.title')}
          description={t('settings:general.notifications.soundTiming.description')}
          control={
            <>
              <ResetToDefaultButton
                visible={isFieldOverridden('soundFocusMode')}
                defaultLabel={t('settings:general.notifications.soundTiming.defaultLabel')}
                onReset={() => resetField('soundFocusMode')}
                disabled={loading}
              />
              <Select
                value={notifications?.soundFocusMode ?? 'always'}
                onValueChange={(next) => update({ soundFocusMode: next as 'always' | 'unfocused' })}
              >
                <SelectTrigger className="w-auto shrink-0 gap-2 [&>span]:line-clamp-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="min-w-max">
                  <SelectItem value="always">
                    {t('settings:general.notifications.soundTiming.always')}
                  </SelectItem>
                  <SelectItem value="unfocused">
                    {t('settings:general.notifications.soundTiming.unfocused')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />

        <SettingRow
          title={t('settings:general.notifications.osNotifications.title')}
          description={t('settings:general.notifications.osNotifications.description')}
          control={
            <>
              <ResetToDefaultButton
                visible={isFieldOverridden('osNotifications')}
                defaultLabel={t('settings:general.notifications.osNotifications.defaultLabel')}
                onReset={() => resetField('osNotifications')}
                disabled={loading}
              />
              <Switch
                checked={notifications?.osNotifications ?? true}
                disabled={loading}
                onCheckedChange={(next) => update({ osNotifications: next })}
              />
            </>
          }
        />
      </div>
    </div>
  );
};

export default NotificationSettingsCard;
