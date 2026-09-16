# Sprint 6 Report (3/18/2025 - 4/10/2025)

## YouTube link of Sprint 6 Video
https://youtu.be/8_k7WzVQK-Q

## What's New (User Facing)
 * Changed data-intake slowdown to adapt to session data instead of using throttle method.
 * Slightly compacted UI to improve readability/usability

## Work Summary (Developer Facing)
In this sprint we wrapped up development, making the final slight adjustments to features to fully meet stakeholder expectations. Our most significant adjustments were to the data intake slowdown feature, which we changed from slowly throttling until it reaches a sustainable speed to instead adjust the speed to the 75th percentile of how fast data had been coming in so-far that data-session. We also made slight adjustments to the UI, so that more of it would fit on the screen at any given time. Finally we added a requirements.txt file for module 1, for the sake of future developers.

## Unfinished Work
We have completed all intended work. All that's left to complete is documentation and presentation of the project to external stakeholders.

## Completed Issues/User Stories
Here are links to the issues that we completed in this sprint:

* https://github.com/KylerKupp/python-desktop-app/issues/19
* https://github.com/KylerKupp/python-desktop-app/issues/113
* https://github.com/KylerKupp/python-desktop-app/issues/121
* https://github.com/KylerKupp/python-desktop-app/issues/122
* https://github.com/KylerKupp/python-desktop-app/issues/123

## Code Files for Review
Please review the following code files, which were actively developed during this sprint, for quality:
 * [module3 main.py](https://github.com/KylerKupp/python-desktop-app/blob/main/module3/application/mainUI/main.py)
 * [module2 main.py](https://github.com/KylerKupp/python-desktop-app/blob/main/module2/application/mainUI/main.py)
 * [module2 frame.py](https://github.com/KylerKupp/python-desktop-app/blob/main/module2/application/uiElements/frame.py)
 * [module1 main.py](https://github.com/KylerKupp/python-desktop-app/blob/main/module1/application/mainUI/main.py)
 * [module1 frame.py](https://github.com/KylerKupp/python-desktop-app/blob/main/module1/application/uiElements/frame.py)
 
## Retrospective Summary
Here's what went well:
  * Responsiveness to client needs
  * Tidiness of Solutions
  * Understanding of time and resources
 
Here's what we'd like to improve:
   * Anticipation of client needs
