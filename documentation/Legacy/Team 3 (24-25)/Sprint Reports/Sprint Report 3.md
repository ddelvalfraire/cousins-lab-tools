# Sprint 3 Report (11/5/2024 to 12/5/2024)

## YouTube link of Sprint 3 Video
https://youtu.be/N24rFE9eLzA?si=3WC2lbnIPwIB1A8h

## What's New (User Facing)
 * Module 3's Mean Bars Rescale Button now rescales based on derivative graph instead of main graph.
 * Implemented Module 3's copy table to clipboard functionality.
 * Implemented Module 3 reset acquisition to allow new data functionality (known as the "STOP" button).
 * Removed extraneous calibration-save pop-up from Module 3.

## Work Summary (Developer Facing)
We consider the "What's New" features to be a round-up of loose ends discovered in acceptance testing of Module 3. These features are one of three big efforts we've made this sprint. The first of the other two efforts is acceptance testing: we delivered a Module 3 prototype last sprint, and this sprint we demonstrated it to our client and collected feedback. Finally we made signficant progress on Module 4, setting up remote access to the relevant computer and identifying the core issues and possible origins. It was necessary to set up remote access because Module 4 will read data directly from the usb port, and so testing the data input functionality requires a computer attached to the Mass Spectrometer.

## Unfinished Work
We initially hoped to complete Module 4 this sprint, but two obstacles stopped this: 1) The discovery of missing/dysfunctional features in Module 3. Previous groups' documentation lead us to believe that these features were complete and tested, but our testing revealed that more work was needed that previously thought. 2) As mentioned above, testing and exploring the existing code on Module 4 was very difficult before we had remote access. This stalled development.

## Completed Issues/User Stories
Here are links to the issues that we completed in this sprint:

* https://github.com/KylerKupp/python-desktop-app/issues/63
* https://github.com/KylerKupp/python-desktop-app/issues/64
* https://github.com/KylerKupp/python-desktop-app/issues/65
* https://github.com/KylerKupp/python-desktop-app/issues/66
* https://github.com/KylerKupp/python-desktop-app/issues/70
* https://github.com/KylerKupp/python-desktop-app/issues/71
* https://github.com/KylerKupp/python-desktop-app/issues/72
* https://github.com/KylerKupp/python-desktop-app/issues/73
* https://github.com/KylerKupp/python-desktop-app/issues/74
* https://github.com/KylerKupp/python-desktop-app/issues/76
* https://github.com/KylerKupp/python-desktop-app/issues/77
* https://github.com/KylerKupp/python-desktop-app/issues/78
* https://github.com/KylerKupp/python-desktop-app/issues/79
* https://github.com/KylerKupp/python-desktop-app/issues/80
* https://github.com/KylerKupp/python-desktop-app/issues/81
* https://github.com/KylerKupp/python-desktop-app/issues/82
* https://github.com/KylerKupp/python-desktop-app/issues/83
* https://github.com/KylerKupp/python-desktop-app/issues/84
* https://github.com/KylerKupp/python-desktop-app/issues/85
* https://github.com/KylerKupp/python-desktop-app/issues/86
* https://github.com/KylerKupp/python-desktop-app/issues/87
* https://github.com/KylerKupp/python-desktop-app/issues/88
* https://github.com/KylerKupp/python-desktop-app/issues/23
 
 ## Incomplete Issues/User Stories
 Here are links to issues we worked on but did not complete in this sprint:
 
 * https://github.com/KylerKupp/python-desktop-app/issues/68 <<We did not complete this feature because of delays in remote access and unexpected extra Module 3 work.>>
 * https://github.com/KylerKupp/python-desktop-app/issues/25 <<See previous issue.>>

## Code Files for Review
Please review the following code files, which were actively developed during this sprint, for quality:
 * [main.py](https://github.com/KylerKupp/python-desktop-app/blob/main/module3/application/mainUI/main.py)
 * [curve.py](https://github.com/KylerKupp/python-desktop-app/blob/main/module3/application/uiElements/curve.py)
 
## Retrospective Summary
Here's what went well:
  * Communication with client
  * Division of labor
  * Communication among team members
  * Individual effort
 
Here's what we'd like to improve:
   * Rate of development
   * Re-testing of inherited code
  
Here are changes we plan to implement in the next sprint:
   * Completion of module 4