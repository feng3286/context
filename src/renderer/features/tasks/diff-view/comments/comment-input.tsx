import { Check, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@renderer/lib/ui/button';
import { Comment, useTextareaAutoFocus } from './comment-card';

interface CommentInputProps {
  lineNumber: number;
  existingContent?: string;
  onSubmit: (content: string) => void | Promise<void>;
  onCancel: () => void;
}

export const CommentInput: React.FC<CommentInputProps> = ({
  lineNumber,
  existingContent,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [content, setContent] = useState(existingContent || '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useTextareaAutoFocus(textareaRef, true);

  const handleSubmit = () => {
    if (content.trim()) {
      void onSubmit(content.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <Comment.Root>
      <Comment.Header>
        <Comment.Title>
          {existingContent ? t('editor:comments.editComment') : t('editor:comments.addComment')}
          <Comment.Meta className="ml-2">
            ({t('editor:comments.line', { number: lineNumber })})
          </Comment.Meta>
        </Comment.Title>
        <Comment.Actions>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8"
            onClick={onCancel}
            title={t('editor:comments.cancel')}
            aria-label={t('editor:comments.cancelComment')}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-8 w-8"
            onClick={handleSubmit}
            disabled={!content.trim()}
            title={t('editor:comments.submit')}
            aria-label={t('editor:comments.submitComment')}
          >
            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </Button>
        </Comment.Actions>
      </Comment.Header>

      <Comment.Body>
        <Comment.Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('editor:comments.addPlaceholder')}
          autoFocus
        />
      </Comment.Body>
    </Comment.Root>
  );
};
