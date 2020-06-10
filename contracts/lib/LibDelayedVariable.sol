pragma solidity 0.5.15;

import "./LibTypes.sol";
import "../lib/LibMath.sol";

library LibDelayedVariable {
    using LibMathUnsigned for uint256;

    /**
      * @dev Return if last modification to the variable is applied.
      *
      * @param variable The delayed variable data storage.
      * @return True if applied.
      */
    function isLastChangeApplied(LibTypes.DelayedVariable storage variable)
        internal
        view
        returns (bool)
    {
        return block.number >= variable.blockHeight;
    }

    /**
      * @dev Return current value if setc block height reached, and return former one if not.
      *
      * @param variable The delayed variable data storage.
      * @return Current value if set block height reached, previous if not.
      */
    function appliedValue(LibTypes.DelayedVariable storage variable)
        internal
        view
        returns (bytes32)
    {
        return isLastChangeApplied(variable) ? variable.currentValue : variable.previousValue;
    }

    /**
      *  @dev Set the newValue after n blocks (including the current block)
      *       rules:
      *         1. new user => set immediately
      *         2. last value change is waiting for delay => overwrite the delayed value and timer
      *         3. last value change has taken effect
      *             3.1 newValue is the same => ignore
      *             3.2 newValue is changing => push the current value, set the delayed value and timer
      *
      * @param variable The delayed variable data storage.
      * @param newValue New value.
      * @param delay    Number blocks to wait before new value applied.
      */
    function setValueDelayed(LibTypes.DelayedVariable storage variable, bytes32 newValue, uint256 delay)
        internal
    {
        if (variable.blockHeight == 0) {
            // condition 1
            variable.currentValue = newValue;
            variable.blockHeight = block.number;
        } else {
            if (isLastChangeApplied(variable)) {
                if (variable.currentValue == newValue) {
                    // condition 3.1
                    return;
                } else {
                    // condition 3.2
                    variable.previousValue = variable.currentValue;
                }
            }
            // condition 2, 3.2
            variable.currentValue = newValue;
            variable.blockHeight = block.number.add(delay);
        }
    }

    /**
      *  @dev Set value instantly. Different to delayed version, this only update current applied value.
      *
      * @param variable The delayed variable data storage.
      * @param newValue New value.
      */
    function setValueInstant(LibTypes.DelayedVariable storage variable, bytes32 newValue)
        internal
    {
        if (appliedValue(variable) == newValue) {
            return;
        }
        if (variable.blockHeight == 0 || isLastChangeApplied(variable)) {
            variable.currentValue = newValue;
        } else {
            variable.previousValue = newValue;
        }
    }
}