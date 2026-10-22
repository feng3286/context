import { MessageSquare, TerminalSquare } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import type { ConversationStore } from '@renderer/features/tasks/conversations/conversation-manager';
import { ToggleOption } from './chat-view';

/** Chat / terminal view-mode switch shown above the conversation pane. */
export const ChatTerminalToggle = observer(function ChatTerminalToggle({
  conversation,
}: {
  conversation: ConversationStore;
}) {
  return (
    <div className="flex shrink-0 items-center border-b border-border px-2 py-1">
      <div className="flex items-center gap-0.5 rounded-md bg-background-2 p-0.5">
        <ToggleOption
          active={conversation.viewMode === 'chat'}
          onClick={() => conversation.setViewMode('chat')}
          icon={<MessageSquare className="size-3" />}
          label="Chat"
        />
        <ToggleOption
          active={conversation.viewMode === 'terminal'}
          onClick={() => conversation.setViewMode('terminal')}
          icon={<TerminalSquare className="size-3" />}
          label="Terminal"
        />
      </div>
    </div>
  );
});
