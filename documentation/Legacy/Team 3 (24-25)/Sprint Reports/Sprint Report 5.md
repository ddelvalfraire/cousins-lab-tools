# Sprint 5 Report (2/5/2025 - 3/17/2025)

## YouTube link of Sprint 5 Video
https://youtu.be/BnqIFWF74QE

## What's New (User Facing)
 * Full module 4 integration into modules 1 and 2.
 * Added automatic intake slow-down to modules 1-3, making real-time data processing seamless.
 * Fixed significant bug affecting timekeeping in modules 1-3. 

## Work Summary (Developer Facing)
This sprint we finished work on module 4. This includes the delivering of the final product, as well as integrating it into modules 1 and 2. During this process, we discovered a major bug in modules 1-3, where the programs would not log the elapsed time in-between the ending data point of each csv, and the starting data point of the next csv. This made all output off by ~10%. This had not been noticed before since, for the most part, it merely makes the data appear to have happen in a smaller amount of time, with no other changes. We also worked on a significant quality-of-life improvement for modules 1-3 this sprint. That improvement is the addition of automatic data intake slow-down when the module reaches the end of available data. This automatic slowdown makes it so the program slows to the point of reading data at the same rate the data is being written, making real-time processing much more seamless.

## Unfinished Work
We have completed all intended functionality, so we are moving to non-functional improvements. This includes UI and potentially performance. These improvements will mostly be aimed at modules 1-3.

## Completed Issues/User Stories
Here are links to the issues that we completed in this sprint:

* https://github.com/KylerKupp/python-desktop-app/issues/109
* https://github.com/KylerKupp/python-desktop-app/issues/110
* https://github.com/KylerKupp/python-desktop-app/issues/111
* https://github.com/KylerKupp/python-desktop-app/issues/113
* https://github.com/KylerKupp/python-desktop-app/issues/114
* https://github.com/KylerKupp/python-desktop-app/issues/115
* https://github.com/KylerKupp/python-desktop-app/issues/116
* https://github.com/KylerKupp/python-desktop-app/issues/25
 
 ## Incomplete Issues/User Stories
 Here are links to issues we worked on but did not complete in this sprint:
 
 * https://github.com/KylerKupp/python-desktop-app/issues/112 Preliminary work/outlining has been made, but no deliverable or draft has been produced.

## Code Files for Review
Please review the following code files, which were actively developed during this sprint, for quality:
 * [module4 main.py](https://github.com/KylerKupp/python-desktop-app/blob/module-4-read-data/module4/application/main.py)
 * [module3 main.py](https://github.com/KylerKupp/python-desktop-app/blob/module-4-read-data/module3/application/mainUI/main.py)
 * [module3 file.py](https://github.com/KylerKupp/python-desktop-app/blob/module-4-read-data/module3/application/read-data/file.py)
 * [module2 main.py](https://github.com/KylerKupp/python-desktop-app/blob/module-4-read-data/module2/application/mainUI/main.py)
 * [module2 file.py](https://github.com/KylerKupp/python-desktop-app/blob/module-4-read-data/module2/application/read-data/file.py)
 * [module1 main.py](https://github.com/KylerKupp/python-desktop-app/blob/module-4-read-data/module1/application/mainUI/main.py)
 * [module1 file.py](https://github.com/KylerKupp/python-desktop-app/blob/module-4-read-data/module1/application/read-data/file.py)
 * [module2 readEZView.py](https://github.com/KylerKupp/python-desktop-app/blob/module-4-read-data/module2/application/read-data/readEZView.py)
 * [module1 readEZView.py](https://github.com/KylerKupp/python-desktop-app/blob/module-4-read-data/module1/application/read-data/readEZView.py)
 
## Retrospective Summary
Here's what went well:
  * Communication among team members and client
  * Resourcefulness in troubleshooting
  * Creative code development
 
Here's what we'd like to improve:
   * Over-reliance on expected quality of existing codebase
  
Here are changes we plan to implement in the next sprint:
   * We are pivoting from development to support and documentation. We will focus more on polishing the projects features than producing new ones.
   * More attention to non-functional requirements over functional requirements
