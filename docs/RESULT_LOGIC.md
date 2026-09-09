# Result Logic / 六种结果选择逻辑

This document records the result-routing code currently executed by the installation. The factual sources are `src/vision/TeachableMachineInference.ts`, `src/core/App.ts`, `src/core/StateMachine.ts`, `src/visual/results/ResultResolver.ts`, and `src/input/KeyboardInputAdapter.ts`.

本文记录装置当前实际执行的结果路由代码。它描述的是程序机制，不是对参与者的事实判断。

## Interpretive boundary / 解释边界

The model reads **gender-coded appearance as defined by its training data**. It does not read or determine a participant's real gender identity, sex, personality, sexuality, consent, compatibility, intimacy, or relationship. The six result names are authored choreographic branches built from limited model outputs.

模型读取的是**由训练数据定义的 gender-coded appearance（性别编码外观）**，而不是参与者真实的性别认同、生理性别、性格、性取向、同意、匹配度、亲密程度或关系事实。六个结果名称是作者基于有限模型输出设计的编舞分支。

## Model outputs and sampling / 模型输出与采样

Camera A and Camera B remain separate. The local Teachable Machine model must expose these two exact class names:

- `feminine-coded appearance`
- `masculine-coded appearance`

The code looks up predictions by exact class-name string; it does not hard-code class indices. A prediction is valid only when both named probabilities exist and are finite numbers.

两台摄像头独立推理。代码按精确类别字符串查找概率，不把类别索引写死。只有两个命名概率都存在且为有限数值时，该次预测才进入缓冲区。

Each camera owns a ten-entry ring buffer. New valid predictions replace the oldest values after the buffer is full. The current values are ordinary arithmetic means, not an EMA, weighted average, majority vote, or single-frame top class.

每台摄像头维护一个容量为 10 的环形缓冲区。缓冲区填满后，新有效预测替换最旧值。平滑值使用普通算术平均，不使用 EMA、加权平均、多数投票或单帧最高类别。

The nominal prediction interval is 200 ms. If a previous prediction is still running, a video has no current frame, the model is unavailable, or prediction throws, that scheduled attempt contributes no sample. Ten valid samples therefore approximate two seconds only when every scheduled inference completes.

名义预测间隔为 200 ms。如果上一次预测尚未完成、视频没有当前帧、模型不可用或预测报错，该轮不会产生样本。因此，只有每次推理都完成时，10 个有效样本才约等于两秒。

## Derived values / 派生数值

For each camera:

```text
avgFeminineA = arithmetic mean of Camera A's latest valid feminine probabilities
avgMasculineA = arithmetic mean of Camera A's latest valid masculine probabilities
sA = avgFeminineA - avgMasculineA
qA = abs(sA)

avgFeminineB = arithmetic mean of Camera B's latest valid feminine probabilities
avgMasculineB = arithmetic mean of Camera B's latest valid masculine probabilities
sB = avgFeminineB - avgMasculineB
qB = abs(sB)

D = abs(sA - sB) / 2
```

| Value | Plain-language meaning in this code | 代码中的通俗含义 |
| --- | --- | --- |
| `s` | Signed balance between the model's two appearance probabilities. Positive leans toward its feminine-coded label; negative leans toward its masculine-coded label. | 模型两类外观概率的有符号差值；正值偏向 feminine-coded 标签，负值偏向 masculine-coded 标签。 |
| `q = abs(s)` | How separated those two model probabilities are for one camera. It is called clarity here, not confidence in a person's identity. | 单路画面中两个模型概率分开的程度；这里只称为“明确度”，不是对人的身份置信度。 |
| `D` | Normalised distance between the two cameras' signed model outputs. | 两路摄像头有符号模型输出之间的归一化距离。 |

`D` is not a measured social, emotional, or psychological distance between people.

`D` 不是两个人之间的社会、情感或心理距离。

## Executed decision order / 实际执行顺序

The order below is part of the rule. The first matching row wins.

下表顺序就是程序判断顺序；命中第一条后即返回结果。

| Order | Exact condition | Result | 中文说明 |
| ---: | --- | --- | --- |
| 1 | Camera A **or** Camera B has fewer than 10 valid samples (`ready === false`) | **Unreadable** | 任一侧不足 10 个有效样本。 |
| 2 | `qA < 0.24` **and** `qB < 0.24` | **Unreadable** | 两侧模型输出都不够明确。 |
| 3 | Exactly one side has `q < 0.24`, and the other side has `q >= 0.42` | **Refusal** | 恰好一侧低明确度，另一侧达到 0.42。 |
| 4 | Exactly one side has `q < 0.24`, and the other side has `q < 0.42` | **Unreadable** | 一侧低明确度，但另一侧也未达到 Refusal 的门槛。 |
| 5 | Both sides have `q >= 0.24`, and `D < 0.18` | **Soft Merge** | 两侧都进入距离判断，且输出距离小于 0.18。 |
| 6 | Both sides have `q >= 0.24`, and `0.18 <= D < 0.40` | **Desire** | 距离从 0.18 起、但小于 0.40。 |
| 7 | Both sides have `q >= 0.24`, and `0.40 <= D < 0.65` | **Misreading** | 距离从 0.40 起、但小于 0.65。 |
| 8 | Both sides have `q >= 0.24`, and `D >= 0.65` | **Collision** | 距离达到或超过 0.65。 |
| 9 | Any state not covered above | **Unreadable** | 任何未覆盖状态安全回落到 Unreadable。 |

### Boundary ownership / 临界值归属

- `q = 0.24` is not low; it enters the both-clear distance branch when the other side also has `q >= 0.24`.
- `q = 0.42` satisfies the clear-side requirement for Refusal when exactly one other side has `q < 0.24`.
- `D = 0.18` is Desire, not Soft Merge.
- `D = 0.40` is Misreading, not Desire.
- `D = 0.65` is Collision, not Misreading.

- `q = 0.24` 不属于低明确度；当另一侧也 `q >= 0.24` 时进入距离分支。
- 当恰好另一侧 `q < 0.24` 时，`q = 0.42` 已满足 Refusal 的清晰侧门槛。
- `D = 0.18` 属于 Desire；`D = 0.40` 属于 Misreading；`D = 0.65` 属于 Collision。

## CONTACT freeze / CONTACT 冻结

After the stabilised inputs have both joined, the current default `CONTACT_CONFIRM_MS` is 350 ms. When the state machine first reaches `CONTACT`, `App` freezes the latest smoothed Camera A/B pair once for that contact sequence. `DualAppearanceSmoother.push()` rejects further samples while frozen, and repeated freeze calls return the same immutable pair.

稳定后的两侧输入都进入 JOIN 后，当前默认 `CONTACT_CONFIRM_MS` 为 350 ms。状态机第一次进入 `CONTACT` 时，`App` 为本次 contact sequence 冻结最新的 A/B 平滑值。冻结后，新的预测不会写入缓冲区，重复冻结也只返回同一份不可变快照。

The selected result cannot change during CONTACT or RESULT. When RESET finishes and the state returns to IDLE, the frozen pair and both ten-sample buffers are cleared; collection then starts again from zero.

在 CONTACT 与 RESULT 期间，已选结果不会因摄像头画面变化而改变。RESET 完成并真正回到 IDLE 后，冻结值和两侧十样本缓冲区才被清空，随后从零重新采集。

## Resolver sources and non-randomness / 结果来源与非随机性

For a real CONTACT, a frozen camera pair is passed to `ResultResolver` first and routes through the table above. The resolver also contains controlled development fallbacks: an explicit future result hint requires confidence `>= 0.5`; fixed and cycle modes exist for development; otherwise the configured safe fallback is Unreadable. These fallbacks do not alter the ML table.

真实 CONTACT 优先把冻结的双摄像头数据交给 `ResultResolver`，并按上表选择。代码还保留受控的开发回退：未来显式结果提示需要 `confidence >= 0.5`；fixed 与 cycle 模式供开发使用；否则安全回退为 Unreadable。这些回退不改变真实 ML 决策表。

The real ML selection uses no `Math.random`, random seed, previous result, repeat suppression, touch order, participant waiting time, or special meaning attached to A/B identity. A seeded value may vary animation details only after a result ID has already been selected.

真实 ML 选择不使用 `Math.random`、随机种子、历史结果、避免连续重复、触摸先后、等待时间或 A/B 身份。视觉 seed 只在结果已经确定之后改变结果内部的编舞细节，不会选择结果类别。

## Keyboard preview mapping / 键盘预览映射

Keyboard previews bypass machine inference:

| Key | Result |
| ---: | --- |
| `1` | Collision |
| `2` | Soft Merge |
| `3` | Desire |
| `4` | Misreading |
| `5` | Refusal |
| `6` | Unreadable |

数字键预览直接指定结果，不读取或改变 ML 路由。

## Known limitations / 已知限制

- **No person or out-of-distribution filter:** the two-class model has no “no person”, “unknown scene”, or background class. Any available video frame may yield two probabilities even when nobody is meaningfully visible.
- **Nominal cadence:** 200 ms is a scheduler interval, not a guaranteed sampling rate. Busy inference, unavailable frames, and errors reduce the effective rate.
- **Recent-frame carry-over:** until CONTACT freezes or RESET returns to IDLE, each camera always represents its latest ten valid frames. A participant moving out of view or a new participant arriving can leave older frames in the window until ten newer valid predictions replace them.
- **Reset timing:** buffers clear after RESET completes, not when RESET begins. The frozen values remain stable through the coda by design.
- **Threshold sensitivity:** values close to `0.24`, `0.42`, `0.18`, `0.40`, or `0.65` can change branches after a small change in camera exposure, pose, background, or averaged probability. There is no extra hysteresis around result thresholds.
- **No demographic validity claim:** the training dataset is not included, and the exported model does not establish fairness, accuracy, or scientific validity.
- **Camera/model failure:** missing model, missing video frames, invalid labels, or fewer than ten valid samples leads to insufficient data and therefore Unreadable for real routing.

- **没有人物／分布外过滤：** 两类别模型没有“无人”“未知场景”或背景类。即使画面中没有清晰人物，可用视频帧仍可能产生两类概率。
- **采样间隔只是名义值：** 200 ms 不是保证的有效采样率；推理繁忙、缺帧或错误都会降低实际频率。
- **旧帧残留：** 在 CONTACT 冻结或 RESET 完成回到 IDLE 前，每侧始终表示最近 10 个有效帧。人物离开或更换后，旧帧会保留到被 10 个新有效预测逐步替换。
- **清空时刻：** 缓冲区在 RESET 结束后清空，而不是 RESET 开始时；这是为了让结果尾声保持冻结。
- **临界值敏感：** 接近五个阈值的结果可能因曝光、姿态、背景或平均概率的小变化而改变；结果阈值没有额外迟滞区。
- **不具有人群有效性证明：** 训练数据集未包含，导出模型也不能证明公平性、准确性或科学有效性。
- **摄像头／模型失败：** 模型缺失、视频缺帧、标签无效或样本不足都会造成数据不足，真实路由安全落到 Unreadable。

## Six bilingual video voice-over lines / 六句中英文视频旁白

These lines describe how the artwork stages each branch. They are narration, not claims that the model has discovered a true relationship.

以下旁白描述作品如何演绎分支，而不是宣称模型发现了真实关系。

1. **Collision** — “The model names this meeting Collision: two gestures compress into the same interval, rebound, and remain visible.” / “模型把这次相遇命名为碰撞：两个动作挤入同一段间隙，回弹，却仍彼此可见。”
2. **Soft Merge** — “The model names this Soft Merge: particles exchange and rhythms align, while two centres continue to breathe.” / “模型把它命名为柔性融合：粒子交换、节奏靠近，而两个中心仍各自呼吸。”
3. **Desire** — “The model names this Desire: two hands follow the same unfinished note, always arriving a fraction apart.” / “模型把它命名为欲望：两只手追随同一个未完成的音符，却总差一点抵达。”
4. **Misreading** — “The model names this Misreading: each response reaches a delayed coordinate where the other person is no longer standing.” / “模型把它命名为误读：每一次回应都抵达一个延迟的坐标，而对方已经不在那里。”
5. **Refusal** — “The model names this Refusal: the centre opens, a hand withdraws, and both subjects keep their own space.” / “模型把它命名为拒绝：中央让出空白，一只手撤回，双方仍保有自己的空间。”
6. **Unreadable** — “The model names this Unreadable: several patterns almost settle, but neither person is erased to complete the classification.” / “模型把它命名为不可读：几种结构几乎成形，却没有任何人为了完成分类而被抹去。”

## Final warning / 最终说明

The routing converts two limited appearance-classifier outputs into an artwork. Its labels, averages, formulas, and thresholds are authored mechanics, not scientifically validated measures of gender, attraction, relationship quality, consent, or future behaviour.

这套路由把两个有限的外观分类输出转化为艺术编舞。类别、平均值、公式和阈值都是作品机制，不是经过科学验证的性别、吸引、关系质量、同意或未来行为指标。
