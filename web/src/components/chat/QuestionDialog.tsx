import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { rejectQuestion, respondQuestion } from "@/api/message"
import { useAppDispatch, useAppState } from "@/stores/appStore"

export function QuestionDialog() {
  const dispatch = useAppDispatch()
  const { pendingQuestion, sessions } = useAppState()
  const [selected, setSelected] = useState<string[][]>([])
  const [customAnswers, setCustomAnswers] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelected([])
    setCustomAnswers([])
    setSubmitting(false)
    setError(null)
  }, [pendingQuestion?.id])

  if (!pendingQuestion) return null

  const directory = sessions.find((session) => session.id === pendingQuestion.sessionID)?.directory
  const questions = pendingQuestion.questions ?? []

  const setQuestionAnswers = (index: number, answers: string[]) => {
    setSelected((prev) => {
      const next = [...prev]
      next[index] = answers
      return next
    })
  }

  const setQuestionCustomAnswer = (index: number, answer: string) => {
    setCustomAnswers((prev) => {
      const next = [...prev]
      next[index] = answer
      return next
    })
  }

  const toggleOption = (questionIndex: number, label: string, multiple?: boolean) => {
    const answers = selected[questionIndex] ?? []
    if (multiple) {
      setQuestionAnswers(
        questionIndex,
        answers.includes(label) ? answers.filter((item) => item !== label) : [...answers, label],
      )
    } else {
      setQuestionAnswers(questionIndex, [label])
    }
  }

  const buildAnswers = () =>
    questions.map((question, index) => {
      const answers = selected[index] ?? []
      const custom = customAnswers[index]?.trim()
      if (question.custom !== false && custom) return [...answers, custom]
      return answers
    })

  const handleSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await respondQuestion(pendingQuestion.id, buildAnswers(), directory)
      dispatch({ type: "CLEAR_PENDING_QUESTION", requestID: pendingQuestion.id })
      dispatch({
        type: "SET_AGENT_STATUS",
        sessionID: pendingQuestion.sessionID,
        status: { sessionID: pendingQuestion.sessionID, state: "busy" },
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await rejectQuestion(pendingQuestion.id, directory)
      dispatch({ type: "CLEAR_PENDING_QUESTION", requestID: pendingQuestion.id })
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => !open && handleReject()}>
      <DialogHeader>
        <DialogTitle>代理提问</DialogTitle>
        <DialogDescription>MiMo Code 需要你做出选择后才能继续。</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] space-y-4 overflow-auto py-2">
        {questions.map((question, questionIndex) => (
          <div key={`${pendingQuestion.id}-${questionIndex}`} className="rounded-md border p-3">
            <div className="mb-2">
              <div className="text-xs font-medium text-muted-foreground">{question.header}</div>
              <div className="text-sm text-foreground">{question.question}</div>
            </div>
            <div className="space-y-2">
              {question.options.map((option) => {
                const checked = Boolean(selected[questionIndex]?.includes(option.label))
                return (
                  <label key={option.label} className="flex items-start gap-2 rounded-md border p-2 hover:bg-muted">
                    <input
                      type={question.multiple ? "checkbox" : "radio"}
                      name={`question-option-${pendingQuestion.id}-${questionIndex}`}
                      checked={checked}
                      onChange={() => toggleOption(questionIndex, option.label, question.multiple)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span className="text-sm">
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.description}</span>
                    </span>
                  </label>
                )
              })}
              {question.custom !== false && (
                <Input
                  value={customAnswers[questionIndex] ?? ""}
                  onChange={(event) => setQuestionCustomAnswer(questionIndex, event.target.value)}
                  placeholder="也可以输入自定义回答..."
                />
              )}
            </div>
          </div>
        ))}
        {error && <p className="text-xs text-destructive">提交失败：{error}</p>}
      </div>
      <DialogFooter className="gap-2">
        <Button variant="outline" onClick={handleReject} disabled={submitting}>
          拒绝
        </Button>
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "提交中..." : "发送回答"}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}
