import { Check, Pencil, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@renderer/lib/ui/button';
import type { DraftComment } from '../stores/draft-comments-store';
import { Comment, useTextareaAutoFocus } from './comment-card';

interface CommentWidgetProps {
  comment: DraftComment;
  onEdit: (content: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
}

export const CommentWidget: React.FC<CommentWidgetProps> = ({ comment, onEdit, onDelete }) => {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useTextareaAutoFocus(editTextareaRef, isEditing);

  const handleStartEditing = () => {
    setEditContent(comment.content);
    setIsEditing(true);
  };

  const handleSave = () => {
    if (editContent.trim()) {
      void onEdit(editContent.trim());
      setIsEditing(false);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  const handleCancel = () => {
    setEditContent(comment.content);
    setIsEditing(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <Comment.Root>
      <Comment.Header>
        <Comment.Title>
          {isEditing ? t('editor:comments.editComment') : t('editor:comments.comment')}
          <Comment.Meta className="ml-2">
            ({t('editor:comments.line', { number: comment.lineNumber })})
          </Comment.Meta>
        </Comment.Title>
        <Comment.Actions>
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                onClick={handleCancel}
                title={t('editor:comments.cancel')}
                aria-label={t('editor:comments.cancelEdit')}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                onClick={handleSave}
                disabled={!editContent.trim()}
                title={t('editor:comments.save')}
                aria-label={t('editor:comments.saveComment')}
              >
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8"
                onClick={handleStartEditing}
                title={t('editor:comments.edit')}
                aria-label={t('editor:comments.editCommentAria')}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => void onDelete()}
                title={t('editor:comments.delete')}
                aria-label={t('editor:comments.deleteCommentAria')}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </Comment.Actions>
      </Comment.Header>

      <Comment.Body>
        {!isEditing ? (
          <Comment.Textarea
            readOnly
            value={comment.content}
            onDoubleClick={handleStartEditing}
            tabIndex={-1}
            onMouseDown={(event) => event.preventDefault()}
            onFocus={(event) => event.currentTarget.blur()}
          />
        ) : (
          <Comment.Textarea
            ref={editTextareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('editor:comments.updatePlaceholder')}
          />
        )}
      </Comment.Body>
    </Comment.Root>
  );
};
