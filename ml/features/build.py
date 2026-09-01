"""Feature-building utilities used by both training and inference."""
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OrdinalEncoder

from ml.features.schema import FeatureSchema


class _DataFrameWrapper(BaseEstimator, TransformerMixin):
    """Convert numpy inputs back to DataFrames so downstream string selectors work.

    sklearn's CalibratedClassifierCV can pass numpy arrays during internal
    cross-validation. This wrapper guarantees the ColumnTransformer always
    receives a DataFrame with the expected column names.
    """

    def __init__(self, columns: list[str]):
        self.columns = columns

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        if isinstance(X, pd.DataFrame):
            return X
        return pd.DataFrame(np.asarray(X), columns=self.columns)


def make_preprocessor(schema: FeatureSchema) -> ColumnTransformer:
    """Build a deterministic sklearn preprocessor for the feature schema.

    Categorical columns are ordinal-encoded with a fixed, sorted category list
    so that the same raw string maps to the same integer at train and serve time.
    """
    transformers = [("num", "passthrough", schema.numerical_cols)]
    if schema.categorical_cols:
        transformers.append(
            (
                "cat",
                OrdinalEncoder(
                    handle_unknown="use_encoded_value",
                    unknown_value=-1,
                    encoded_missing_value=-1,
                ),
                schema.categorical_cols,
            )
        )
    return ColumnTransformer(transformers, verbose_feature_names_out=False)


def build_X(df: pd.DataFrame, schema: FeatureSchema, preprocessor: ColumnTransformer) -> np.ndarray:
    """Return a numpy feature matrix aligned with the preprocessor output."""
    return preprocessor.transform(df[schema.feature_cols])
