import type React from 'react';
import { useState } from 'react';
import { Button, Input, Space, Typography } from 'antd';
import type { IAgentQuestion, TAgentQuestionAnswer } from '@falang/agent';
import { useAgentChatT } from './use-agent-chat-t.js';

const styles: Record<string, React.CSSProperties> = {
  reply: { whiteSpace: 'pre-wrap' },
  options: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' },
  optionButton: { height: 'auto', textAlign: 'left', whiteSpace: 'normal' },
};

/** Option buttons, "Other…" and "Decide yourself" for the open question (ADR 0047). */
const QuestionActions: React.FC<{
  readonly question: IAgentQuestion;
  readonly onAnswer: (answer: TAgentQuestionAnswer) => void;
}> = ({ question, onAnswer }) => {
  const t = useAgentChatT();
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');
  const submitOther = (): void => {
    const text = otherText.trim();
    if (text) onAnswer({ other: text });
  };
  return (
    <div style={styles.options}>
      {question.options.map((option) => (
        <Button key={option.label} style={styles.optionButton} onClick={() => onAnswer({ option: option.label })}>
          <span>
            {option.label}
            {option.description ? (
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                {option.description}
              </Typography.Text>
            ) : null}
          </span>
        </Button>
      ))}
      {question.allowOther && !otherOpen ? (
        <Button onClick={() => setOtherOpen(true)}>{t('agent-chat:question-other')}</Button>
      ) : null}
      {question.allowOther && otherOpen ? (
        <Space.Compact>
          <Input
            autoFocus
            placeholder={t('agent-chat:question-other-placeholder')}
            value={otherText}
            onChange={(event) => setOtherText(event.target.value)}
            onPressEnter={submitOther}
          />
          <Button type="primary" disabled={!otherText.trim()} onClick={submitOther}>
            {t('agent-chat:question-other-submit')}
          </Button>
        </Space.Compact>
      ) : null}
      <Button type="dashed" onClick={() => onAnswer({ decideYourself: true })}>
        {t('agent-chat:question-decide-yourself')}
      </Button>
    </div>
  );
};

export const QuestionView: React.FC<{
  readonly question: IAgentQuestion;
  readonly onAnswer: ((answer: TAgentQuestionAnswer) => void) | null;
}> = ({ question, onAnswer }) => (
  <>
    <Typography.Text style={styles.reply}>{question.question}</Typography.Text>
    {onAnswer ? (
      <QuestionActions question={question} onAnswer={onAnswer} />
    ) : (
      <Typography.Text type="secondary" style={styles.reply}>
        {question.options.map((option) => `• ${option.label}`).join('\n')}
      </Typography.Text>
    )}
  </>
);
