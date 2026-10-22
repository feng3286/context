import { MessageSquare, Plus } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import type { ChatTab, ChatTabsStore } from '@renderer/features/chat/chat-tabs-store';
import { asMounted, getProjectStore } from '@renderer/features/projects/stores/project-selectors';
import { AgentStatusIndicator } from '@renderer/features/tasks/components/agent-status-indicator';
import { ConversationStore } from '@renderer/features/tasks/conversations/conversation-manager';
import { useProvisionedTask } from '@renderer/features/tasks/task-view-context';
import AgentLogo from '@renderer/lib/components/agent-logo';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { ShortcutHint } from '@renderer/lib/ui/shortcut-hint';
import { TabBar } from '@renderer/lib/ui/tab-bar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { agentConfig } from '@renderer/utils/agentConfig';
import { formatConversationTitleForDisplay } from './conversation-title-utils';

/** One entry in the merged task tab strip: a TUI conversation or a chat tab. */
type TabEntry =
  | { kind: 'conversation'; store: ConversationStore }
  | { kind: 'chat'; store: ChatTab };

function chatEntryId(id: string): string {
  return `chat:${id}`;
}

export const ConversationsTabs = observer(function ConversationsTabs({
  projectId,
  taskId,
  chatTabs,
}: {
  projectId: string;
  taskId: string;
  chatTabs: ChatTabsStore;
}) {
  const provisioned = useProvisionedTask();
  const { t } = useTranslation();
  const conversationMgr = provisioned.conversations;
  const conversationTabs = provisioned.taskView.conversationTabs;
  const showCreateConversationModal = useShowModal('createConversationModal');
  const showCreateChatTabModal = useShowModal('createChatTabModal');
  const mountedProject = asMounted(getProjectStore(projectId));
  const connectionId =
    mountedProject?.data.type === 'ssh' ? mountedProject.data.connectionId : undefined;

  const entries: TabEntry[] = [
    ...conversationTabs.tabs.map((store) => ({ kind: 'conversation', store }) as const),
    ...chatTabs.tabs.map((store) => ({ kind: 'chat', store }) as const),
  ];
  const activeEntryId = chatTabs.activeId
    ? chatEntryId(chatTabs.activeId)
    : conversationTabs.activeTabId;

  return (
    <TabBar<TabEntry>
      tabs={entries}
      activeTabId={activeEntryId}
      getId={(e) => (e.kind === 'conversation' ? e.store.data.id : chatEntryId(e.store.id))}
      getLabel={(e) =>
        e.kind === 'conversation'
          ? formatConversationTitleForDisplay(e.store.data.providerId, e.store.data.title)
          : (agentConfig[e.store.providerId as keyof typeof agentConfig]?.name ??
            e.store.providerId)
      }
      onSelect={(id) => {
        if (id.startsWith('chat:')) {
          chatTabs.setActive(id.slice('chat:'.length));
        } else {
          chatTabs.setActive(null);
          conversationTabs.setActiveTab(id);
        }
      }}
      onRemove={(id) => {
        if (id.startsWith('chat:')) {
          void chatTabs.remove(id.slice('chat:'.length));
        } else {
          conversationTabs.removeTab(id);
        }
      }}
      renderTabPrefix={(e) => {
        const providerId = e.kind === 'conversation' ? e.store.data.providerId : e.store.providerId;
        const config = agentConfig[providerId as keyof typeof agentConfig];
        if (!config) return null;
        return (
          <AgentLogo
            logo={config.logo}
            alt={config.alt}
            isSvg={config.isSvg}
            invertInDark={config.invertInDark}
            className="size-4"
          />
        );
      }}
      renderTabSuffix={(e) =>
        e.kind === 'conversation' ? (
          <AgentStatusIndicator status={e.store.indicatorStatus} disableTooltip />
        ) : (
          <MessageSquare className="size-3 text-muted-foreground" />
        )
      }
      onRename={(id, name) => {
        if (!id.startsWith('chat:')) void conversationMgr.renameConversation(id, name);
      }}
      onReorder={(from, to) => conversationTabs.reorderTabs(from, to)}
      actions={
        <>
          <Tooltip>
            <TooltipTrigger>
              <button
                className="size-10 justify-center items-center flex border-l hover:bg-background text-foreground-muted hover:text-foreground"
                onClick={() =>
                  showCreateConversationModal({
                    connectionId,
                    projectId,
                    taskId,
                    onSuccess: (result) => {
                      const { conversationId } = result as { conversationId: string };
                      conversationTabs.setActiveTab(conversationId);
                    },
                  })
                }
              >
                <Plus className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {t('conversation:createTitle')}
              <ShortcutHint settingsKey="newConversation" />
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger>
              <button
                className="size-10 justify-center items-center flex border-l hover:bg-background text-foreground-muted hover:text-foreground"
                onClick={() =>
                  showCreateChatTabModal({
                    projectId,
                    taskId,
                    excludeProviderIds: chatTabs.tabs.map((t) => t.providerId),
                    onCreate: (providerId: string) => {
                      void chatTabs.create(providerId);
                    },
                  })
                }
              >
                <MessageSquare className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('chat:createTab.title')}</TooltipContent>
          </Tooltip>
        </>
      }
    />
  );
});
