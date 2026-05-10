# HR — Sample Questions

## Descriptive

1. **What is headcount by function and region for the current quarter?** [`chat-completion`]
2. **Show attrition trend by function for the last 4 quarters.** [`conversation`]
3. **Open requisitions by location, function, and time-to-fill.** [`conversation`]

## Diagnostic

4. **Why has attrition spiked in sales territory T?** [`agent`]
   *Pay band, manager span, geography, manager-specific, engagement survey signal.*
5. **What is the root cause of recordable safety incidents on line 7?** [`agent`]
   *Cross-vertical with manufacturing: staffing, training, equipment, shift pattern.*
6. **Why is time-to-fill high for planner roles in the supply-chain function?** [`agent`]
   *External market scarcity, internal compensation band, candidate-experience drop-off.*

## Predictive

7. **Where is staffing short for the next 4 weeks given demand-driven labour requirements?** [`agent`]
   *Cross-vertical with supply-chain and manufacturing.*
8. **Which roles are highest flight-risk based on engagement-survey signals and tenure?** [`agent`]
   *Model-backed; surfaces existing flight-risk model output if one exists.*

## Prescriptive

9. **For plant P's night-shift operator gap, recommend the recruit / redeploy / overtime mix that minimises cost while protecting plan adherence.** [`agent`]
10. **For AI-literacy training across planning, recommend the skill-gap-aware learning-path sequence.** [`agent`]

## Anti-patterns

- "Hire / fire / promote individual X." — out of scope. The agent informs decisions; people decisions stay with managers and HRBPs.
- "Predict whether employee X will leave." — high-stakes individual prediction. If a flight-risk model exists, it is used at aggregate level for action design, not for individual-level decisions.

<!-- SME REVIEW NEEDED:
     A people-analytics SME and an employment-law-aware HRBP should review individual-level questions for ethical and regulatory soundness. -->
